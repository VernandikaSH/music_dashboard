-- Listening Tracker schema.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it upgrades an existing database in place and keeps data.

-- Stop if this is some other app's database: the grants at the end of this
-- file change permissions on EVERY table in the public schema.
do $$
declare
  other text;
begin
  select string_agg(table_name, ', ') into other
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
    and table_name not in (
      'plays', 'tracks', 'artists', 'blocklist', 'aliases', 'lookup_cache', 'sync_state', 'kept_tracks',
      'merge_dismissals'
    );
  if other is not null then
    raise exception 'Wrong project? This database has tables that are not the music dashboard''s: %. Nothing was changed.', other;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists plays (
  id               bigint generated always as identity primary key,
  played_at        timestamptz not null,
  artist_raw       text not null,      -- as received; never edited
  title_raw        text not null,      -- as received; never edited
  album_raw        text not null default '',
  channel_raw      text,               -- Takeout plays only
  video_id         text,               -- Takeout plays only
  source           text not null check (source in ('lastfm', 'takeout', 'spotify_export')),
  artist_clean     text,               -- set by the plays_set_keys trigger
  title_clean      text,               -- set by the plays_set_keys trigger
  artist_key       text not null,      -- set by the plays_set_keys trigger
  track_key        text not null,      -- set by the plays_set_keys trigger
  version_type     text not null default 'unknown',
  is_duplicate     boolean not null default false,
  maybe_not_music  boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (source, played_at, artist_raw, title_raw)
);

-- Upgrades for databases created before these columns existed.
alter table plays add column if not exists artist_clean text;
alter table plays add column if not exists title_clean text;
alter table plays add column if not exists image_url text;  -- Last.fm cover art, when it has one

-- Phase 2 cleanup (src/lib/cleanup.ts). null = not cleaned yet; the trigger
-- then falls back to the raw names.
alter table plays add column if not exists artist_auto text;
alter table plays add column if not exists title_auto text;
alter table plays add column if not exists artist_unknown boolean not null default false;  -- label channel, needs a fix
alter table plays add column if not exists cleanup_version integer not null default 0;     -- CLEANUP_VERSION that cleaned it
alter table plays drop constraint if exists plays_version_type_check;
alter table plays add constraint plays_version_type_check check (version_type in (
  'official_audio', 'official_video', 'lyric', 'live', 'cover', 'remix', 'unknown'
));
create index if not exists plays_cleanup_version_idx on plays (cleanup_version);

-- Canonical lookup keys, set by the trigger: the names after cleanup (and the
-- artist lookup), before manual fixes. lookup_cache is keyed on these.
alter table plays add column if not exists lookup_artist_key text;
alter table plays add column if not exists lookup_track_key text;
create index if not exists plays_lookup_artist_key_idx on plays (lookup_artist_key);
create index if not exists plays_lookup_track_key_idx on plays (lookup_track_key);

-- track_key with any remix / sped up / slowed part of the title removed, set
-- by the trigger. Equal to track_key for everything but remixes and edits.
-- Charts can group on it to merge remixes into the original.
alter table plays add column if not exists base_track_key text;
create index if not exists plays_base_track_key_idx on plays (base_track_key, played_at);

create index if not exists plays_played_at_idx on plays (played_at desc);
create index if not exists plays_artist_key_idx on plays (artist_key, played_at);
create index if not exists plays_track_key_idx on plays (track_key, played_at);

create table if not exists tracks (
  track_key            text primary key,
  artist_clean         text not null,
  title_clean          text not null,
  album                text,
  duration_s           integer,
  duration_checked_at  timestamptz
);

-- Cover found by looking the track up (iTunes), for plays Last.fm sent without one.
alter table tracks add column if not exists image_url text;
alter table tracks add column if not exists image_checked_at timestamptz;

-- Artist photos (Deezer). Last.fm no longer provides artist images.
create table if not exists artists (
  artist_key        text primary key,
  name              text not null,
  image_url         text,
  image_checked_at  timestamptz
);

-- The name Deezer uses, e.g. "TOMORROW X TOGETHER" for "TXT (투바투)".
alter table artists add column if not exists matched_name text;

create table if not exists blocklist (
  kind        text not null check (kind in ('channel', 'artist', 'track')),
  value       text not null,           -- channel: lowercased name; artist: artist_key; track: track_key
  label       text not null,           -- what to show on the blocklist page
  created_at  timestamptz not null default now(),
  primary key (kind, value)
);

-- Manual fixes. from_key is always built from the RAW fields:
--   kind 'artist': normalize_key(artist_raw)                -> to_artist
--   kind 'track':  normalize_key(artist_raw)|normalize_key(title_raw) -> to_artist, to_title
-- A track fix wins over an artist fix.
create table if not exists aliases (
  kind        text not null default 'track',
  from_key    text not null,
  to_artist   text,
  to_title    text,
  created_at  timestamptz not null default now(),
  primary key (kind, from_key)
);

-- Upgrade the first version of aliases (from_key primary key, to_key).
alter table aliases add column if not exists kind text not null default 'track';
alter table aliases add column if not exists to_artist text;
alter table aliases add column if not exists to_title text;
alter table aliases drop column if exists to_key;
alter table aliases drop constraint if exists aliases_pkey;
alter table aliases add constraint aliases_pkey primary key (kind, from_key);
alter table aliases drop constraint if exists aliases_kind_check;
alter table aliases add constraint aliases_kind_check check (kind in ('artist', 'track'));

-- Last.fm / MusicBrainz results (src/lib/lookups.ts), looked up once each:
--   'artist:<lookup_artist_key>' -> {name, recognized}       name null = keep as is
--   'track:<lookup_track_key>'   -> {recognized, duration_s, album, source}
create table if not exists lookup_cache (
  raw_key       text primary key,
  result        jsonb,
  looked_up_at  timestamptz not null default now()
);

-- Tracks flagged "maybe not music" that I reviewed and kept.
create table if not exists kept_tracks (
  track_key   text primary key,
  label       text not null,
  created_at  timestamptz not null default now()
);

create table if not exists sync_state (
  id              integer primary key default 1 check (id = 1),
  last_played_at  timestamptz,
  last_run_at     timestamptz,
  last_error      text,
  last_inserted   integer
);

-- false until one full re-fetch has filled image_url on plays saved before covers were stored
alter table sync_state add column if not exists artwork_backfilled boolean not null default false;
-- Bumped in code when the lookup rules change, so old results are redone.
alter table sync_state add column if not exists cover_lookup_version integer not null default 0;

insert into sync_state (id) values (1) on conflict (id) do nothing;

-- Suggested merges (merge_suggestions) I marked "not the same".
create table if not exists merge_dismissals (
  kind        text not null check (kind in ('artist', 'track')),
  from_key    text not null,
  to_key      text not null,
  created_at  timestamptz not null default now(),
  primary key (kind, from_key, to_key)
);

-- ---------------------------------------------------------------------------
-- Lock everything down. The app talks to Supabase only from the server with
-- the secret key, which bypasses RLS. With RLS on and no policies, the public
-- (anon) key can read nothing.
-- ---------------------------------------------------------------------------

alter table plays        enable row level security;
alter table tracks       enable row level security;
alter table blocklist    enable row level security;
alter table aliases      enable row level security;
alter table lookup_cache enable row level security;
alter table sync_state   enable row level security;
alter table artists      enable row level security;
alter table kept_tracks  enable row level security;
alter table merge_dismissals enable row level security;

-- ---------------------------------------------------------------------------
-- Keys and cleaned names: automatic cleanup (artist_auto / title_auto, else
-- the raw names), then the looked-up artist name, then manual fixes (aliases)
-- on top. Aliases stay keyed on the raw names, so cleanup rule changes never
-- orphan a fix.
-- ---------------------------------------------------------------------------

create or replace function normalize_key(s text)
returns text
language sql immutable as $$
  select btrim(regexp_replace(lower(normalize(coalesce(s, ''), NFKC)), '\s+', ' ', 'g'));
$$;

-- "Supernova (Sped Up)" / "Supernova - Slowed + Reverb" -> "Supernova". Same
-- words as REMIX in src/lib/cleanup.ts.
create or replace function strip_remix(s text)
returns text
language sql immutable as $$
  select coalesce(nullif(btrim(regexp_replace(
    regexp_replace(s, '\s*[(\[【][^()\[\]【】]*(remix|sped ?up|slowed|nightcore|reverb)[^()\[\]【】]*[)\]】]', '', 'gi'),
    '\s+[-–—]\s+[^-–—]*(remix|sped ?up|slowed|nightcore|reverb).*$', '', 'i'
  )), ''), s);
$$;

create or replace function plays_set_keys()
returns trigger
language plpgsql as $$
declare
  raw_artist_key text := normalize_key(new.artist_raw);
  raw_track_key  text := raw_artist_key || '|' || normalize_key(new.title_raw);
  fix record;
  looked_up text;
begin
  new.artist_clean := coalesce(nullif(new.artist_auto, ''), new.artist_raw);
  new.title_clean  := coalesce(nullif(new.title_auto, ''), new.title_raw);

  new.lookup_artist_key := normalize_key(new.artist_clean);
  select result->>'name' into looked_up from lookup_cache where raw_key = 'artist:' || new.lookup_artist_key;
  if looked_up is not null then new.artist_clean := looked_up; end if;
  new.lookup_track_key := normalize_key(new.artist_clean) || '|' || normalize_key(new.title_clean);

  select to_artist into fix from aliases where kind = 'artist' and from_key = raw_artist_key;
  if found then new.artist_clean := fix.to_artist; end if;

  select to_artist, to_title into fix from aliases where kind = 'track' and from_key = raw_track_key;
  if found then
    new.artist_clean := fix.to_artist;
    new.title_clean  := coalesce(fix.to_title, new.title_clean);
  end if;

  new.artist_key := normalize_key(new.artist_clean);
  new.track_key  := new.artist_key || '|' || normalize_key(new.title_clean);
  new.base_track_key := new.artist_key || '|' || normalize_key(strip_remix(new.title_clean));
  return new;
end;
$$;

drop trigger if exists plays_set_keys on plays;
create trigger plays_set_keys
  before insert or update on plays
  for each row execute function plays_set_keys();

-- Fill the cleaned columns on rows saved before the trigger existed.
update plays set artist_raw = artist_raw
where artist_clean is null or lookup_track_key is null or base_track_key is null;

-- Saves cleanup results (one row per play id); the trigger then rebuilds the keys.
create or replace function apply_cleanup(p_rows jsonb)
returns integer
language plpgsql as $$
declare
  n integer;
begin
  update plays p
  set artist_auto     = r.artist_auto,
      title_auto      = r.title_auto,
      version_type    = r.version_type,
      maybe_not_music = r.maybe_not_music,
      artist_unknown  = r.artist_unknown,
      cleanup_version = r.cleanup_version
  from jsonb_to_recordset(p_rows) as r(
    id bigint, artist_auto text, title_auto text, version_type text,
    maybe_not_music boolean, artist_unknown boolean, cleanup_version integer
  )
  where p.id = r.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Lookups still to do, most-played first. Label-channel plays are skipped:
-- they need a manual fix, not a lookup. Misses are retried after 30 days.
-- titles: a few of the artist's songs, to tell namesakes apart.
drop function if exists artists_needing_lookup(int);
create or replace function artists_needing_lookup(p_limit int)
returns table (lookup_key text, artist text, titles text[])
language sql stable as $$
  select
    p.lookup_artist_key,
    mode() within group (order by coalesce(nullif(p.artist_auto, ''), p.artist_raw)),
    (array_agg(distinct coalesce(nullif(p.title_auto, ''), p.title_raw)))[1:5]
  from plays p
  left join lookup_cache c on c.raw_key = 'artist:' || p.lookup_artist_key
  where not p.artist_unknown
    and (c.raw_key is null
      or ((c.result->>'recognized')::boolean is not true and c.looked_up_at < now() - interval '30 days'))
  group by p.lookup_artist_key
  order by count(*) desc
  limit p_limit;
$$;

-- Waits for the artist lookup, whose name is part of the track key.
create or replace function tracks_needing_lookup(p_limit int)
returns table (lookup_key text, artist text, title text)
language sql stable as $$
  select
    p.lookup_track_key,
    mode() within group (order by coalesce(a.result->>'name', nullif(p.artist_auto, ''), p.artist_raw)),
    mode() within group (order by coalesce(nullif(p.title_auto, ''), p.title_raw))
  from plays p
  join lookup_cache a on a.raw_key = 'artist:' || p.lookup_artist_key
  left join lookup_cache c on c.raw_key = 'track:' || p.lookup_track_key
  where not p.artist_unknown
    and (c.raw_key is null
      or (((c.result->>'recognized')::boolean is not true or c.result->>'duration_s' is null)
        and c.looked_up_at < now() - interval '30 days'))
  group by p.lookup_track_key
  order by count(*) desc
  limit p_limit;
$$;

-- Saves lookup results and re-runs the trigger on the plays they apply to.
create or replace function save_lookups(p_rows jsonb)
returns integer
language plpgsql as $$
declare
  n integer;
begin
  insert into lookup_cache (raw_key, result, looked_up_at)
  select r.raw_key, r.result, now()
  from jsonb_to_recordset(p_rows) as r(raw_key text, result jsonb)
  on conflict (raw_key) do update set result = excluded.result, looked_up_at = now();

  update plays set artist_raw = artist_raw
  where lookup_artist_key in (
      select substr(r.raw_key, 8) from jsonb_to_recordset(p_rows) as r(raw_key text) where r.raw_key like 'artist:%'
    )
    or lookup_track_key in (
      select substr(r.raw_key, 7) from jsonb_to_recordset(p_rows) as r(raw_key text) where r.raw_key like 'track:%'
    );
  get diagnostics n = row_count;
  perform mark_duplicates();
  perform refresh_tracks();
  return n;
end;
$$;

-- The same track again within 60 seconds of its previous play counts once.
-- Recomputed over all plays, since a fix or cleanup can change any track_key.
create or replace function mark_duplicates()
returns integer
language plpgsql as $$
declare
  n integer;
begin
  with flagged as (
    select id,
      coalesce(
        played_at - lag(played_at) over (partition by track_key order by played_at, id) < interval '60 seconds',
        false
      ) as dup
    from plays
  )
  update plays p set is_duplicate = f.dup
  from flagged f
  where p.id = f.id and p.is_duplicate <> f.dup;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- One row per track_key with what its plays share:
-- album: the most common album sent with any of its plays, so MVs and lyric
--   videos (sent with no album) borrow the official audio's album; else the
--   album from the lookup.
-- duration_s: the looked-up length, for estimated listening time.
-- Recomputed over all plays, since a fix or cleanup can change any track_key.
create or replace function refresh_tracks()
returns integer
language plpgsql as $$
declare
  n integer;
begin
  insert into tracks as t (track_key, artist_clean, title_clean, album, duration_s, duration_checked_at)
  select
    p.track_key,
    mode() within group (order by p.artist_clean),
    mode() within group (order by p.title_clean),
    coalesce(
      mode() within group (order by p.album_raw) filter (where p.album_raw <> ''),
      mode() within group (order by lc.result->>'album') filter (where lc.result->>'album' <> '')
    ),
    mode() within group (order by (lc.result->>'duration_s')::integer)
      filter (where lc.result->>'duration_s' is not null),
    now()
  from plays p
  left join lookup_cache lc on lc.raw_key = 'track:' || p.lookup_track_key
  group by p.track_key
  on conflict (track_key) do update
    set album = excluded.album, duration_s = excluded.duration_s, duration_checked_at = excluded.duration_checked_at
    where t.album is distinct from excluded.album or t.duration_s is distinct from excluded.duration_s;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Fix one track (every raw spelling currently grouped under p_track_key).
create or replace function fix_track(p_track_key text, p_artist text, p_title text)
returns integer
language plpgsql as $$
declare
  n integer;
begin
  insert into aliases (kind, from_key, to_artist, to_title)
  select distinct 'track', normalize_key(artist_raw) || '|' || normalize_key(title_raw), p_artist, p_title
  from plays where track_key = p_track_key
  on conflict (kind, from_key) do update
    set to_artist = excluded.to_artist, to_title = excluded.to_title, created_at = now();

  update plays set artist_raw = artist_raw where track_key = p_track_key;
  get diagnostics n = row_count;
  perform mark_duplicates();
  perform refresh_tracks();
  return n;
end;
$$;

-- Rename an artist, or merge it into another by giving that artist's name.
create or replace function fix_artist(p_artist_key text, p_artist text)
returns integer
language plpgsql as $$
declare
  n integer;
begin
  -- Plays that got this artist from a track fix (e.g. "Genie Music - Drama")
  -- must not turn the raw uploader name into an artist alias.
  insert into aliases (kind, from_key, to_artist)
  select distinct 'artist', normalize_key(p.artist_raw), p_artist
  from plays p
  where p.artist_key = p_artist_key
    and not exists (
      select 1 from aliases a
      where a.kind = 'track'
        and a.from_key = normalize_key(p.artist_raw) || '|' || normalize_key(p.title_raw)
    )
  on conflict (kind, from_key) do update
    set to_artist = excluded.to_artist, created_at = now();

  update aliases set to_artist = p_artist
  where kind = 'track' and normalize_key(to_artist) = p_artist_key;

  update plays set artist_raw = artist_raw where artist_key = p_artist_key;
  get diagnostics n = row_count;
  perform mark_duplicates();
  perform refresh_tracks();
  return n;
end;
$$;

-- Sync saves new plays with "insert ... on conflict do nothing", so covers for
-- plays that already exist are filled in here instead.
create or replace function fill_images(p_rows jsonb)
returns integer
language plpgsql as $$
declare
  n integer;
begin
  update plays p
  set image_url = r.image_url
  from jsonb_to_recordset(p_rows)
    as r(source text, played_at timestamptz, artist_raw text, title_raw text, image_url text)
  where p.source = r.source and p.played_at = r.played_at
    and p.artist_raw = r.artist_raw and p.title_raw = r.title_raw
    and p.image_url is null and r.image_url is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function remove_alias(p_kind text, p_from_key text)
returns integer
language plpgsql as $$
declare
  n integer;
begin
  delete from aliases where kind = p_kind and from_key = p_from_key;
  if p_kind = 'artist' then
    update plays set artist_raw = artist_raw where normalize_key(artist_raw) = p_from_key;
  else
    update plays set artist_raw = artist_raw
    where normalize_key(artist_raw) || '|' || normalize_key(title_raw) = p_from_key;
  end if;
  get diagnostics n = row_count;
  perform mark_duplicates();
  perform refresh_tracks();
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views (dropped first: their column lists change when plays gains columns)
-- ---------------------------------------------------------------------------

drop view if exists visible_plays;
drop view if exists plays_with_status;

-- album: the play's own album, else the one its track borrows (refresh_tracks).
-- cover_url: the play's own Last.fm cover, else a looked-up track cover, else
-- the artist photo.
-- duration_s: the track's looked-up length; null = unknown (est_seconds guesses).
-- recognized: null until looked up; false = neither Last.fm nor MusicBrainz
-- knows it. needs_review: flagged "maybe not music" and not kept yet. Covers
-- are only flagged by title words: YouTube covers are rarely in either catalog.
create view plays_with_status with (security_invoker = true) as
select
  p.*,
  coalesce(nullif(p.album_raw, ''), t.album, '') as album,
  coalesce(p.image_url, t.image_url, a.image_url) as cover_url,
  a.image_url as artist_image_url,
  coalesce(t.duration_s, (lc.result->>'duration_s')::integer) as duration_s,
  (lc.result->>'recognized')::boolean as recognized,
  (p.maybe_not_music or ((lc.result->>'recognized')::boolean is false and p.version_type <> 'cover'))
    and not exists (select 1 from kept_tracks k where k.track_key = p.track_key) as needs_review,
  exists (
    select 1 from blocklist b
    where (b.kind = 'artist'  and b.value = p.artist_key)
       or (b.kind = 'track'   and b.value = p.track_key)
       or (b.kind = 'channel' and b.value = lower(p.channel_raw))
  ) as is_blocked
from plays p
left join tracks t on t.track_key = p.track_key
left join artists a on a.artist_key = p.artist_key
left join lookup_cache lc on lc.raw_key = 'track:' || p.lookup_track_key;

-- What every chart counts: not blocked, not a duplicate.
create view visible_plays with (security_invoker = true) as
select * from plays_with_status
where not is_blocked and not is_duplicate;

-- ---------------------------------------------------------------------------
-- Chart functions. p_from null = all time. p_artist_key null = all artists.
-- Dropped first because "create or replace" can't change a return type.
-- ---------------------------------------------------------------------------

drop function if exists range_summary(timestamptz, timestamptz);
drop function if exists top_artists(timestamptz, timestamptz, int, int);
drop function if exists top_tracks(timestamptz, timestamptz, int, int, text);
drop function if exists top_tracks(timestamptz, timestamptz, int, int, text, boolean);
drop function if exists top_albums(timestamptz, timestamptz, int, int);
drop function if exists plays_over_time(timestamptz, timestamptz, text, text);
drop function if exists artist_summary(text);

-- Estimated seconds of one play: the track's length, or 3:30 when unknown.
-- Listening time is always shown as an estimate next to plays.
create or replace function est_seconds(p_duration_s integer)
returns integer
language sql immutable as $$
  select coalesce(p_duration_s, 210);
$$;

-- est_seconds: estimated listening time. guessed_seconds: the part of it from
-- plays whose length is unknown.
create or replace function range_summary(p_from timestamptz, p_to timestamptz)
returns table (plays bigint, artists bigint, tracks bigint, est_seconds bigint, guessed_seconds bigint)
language sql stable as $$
  select
    count(*), count(distinct artist_key), count(distinct track_key),
    coalesce(sum(est_seconds(duration_s)), 0),
    coalesce(sum(est_seconds(duration_s)) filter (where duration_s is null), 0)
  from visible_plays
  where played_at >= coalesce(p_from, '-infinity') and played_at < p_to;
$$;

create or replace function top_artists(
  p_from timestamptz, p_to timestamptz, p_limit int, p_offset int
)
returns table (artist_key text, artist text, image_url text, plays bigint, total_count bigint)
language sql stable as $$
  select
    v.artist_key,
    mode() within group (order by v.artist_clean),
    coalesce(
      max(v.artist_image_url),
      mode() within group (order by v.cover_url) filter (where v.cover_url is not null)
    ),
    count(*) as plays,
    count(*) over ()
  from visible_plays v
  where v.played_at >= coalesce(p_from, '-infinity') and v.played_at < p_to
  group by v.artist_key
  order by plays desc, 2 asc
  limit p_limit offset p_offset;
$$;

-- p_merge_remixes: count remixes and sped up / slowed edits as the original
-- (group by base_track_key). The original's title wins when both were played.
create or replace function top_tracks(
  p_from timestamptz, p_to timestamptz, p_limit int, p_offset int,
  p_artist_key text default null, p_merge_remixes boolean default false
)
returns table (
  track_key text, base_track_key text, artist_key text, artist text, title text, image_url text,
  plays bigint, total_count bigint
)
language sql stable as $$
  select
    case when p_merge_remixes then v.base_track_key else v.track_key end,
    mode() within group (order by v.base_track_key),
    mode() within group (order by v.artist_key),
    mode() within group (order by v.artist_clean),
    coalesce(
      mode() within group (order by v.title_clean) filter (where v.track_key = v.base_track_key),
      mode() within group (order by v.title_clean)
    ),
    mode() within group (order by v.cover_url) filter (where v.cover_url is not null),
    count(*) as plays,
    count(*) over ()
  from visible_plays v
  where v.played_at >= coalesce(p_from, '-infinity') and v.played_at < p_to
    and (p_artist_key is null or v.artist_key = p_artist_key)
  group by 1
  order by plays desc, 5 asc
  limit p_limit offset p_offset;
$$;

create or replace function top_albums(
  p_from timestamptz, p_to timestamptz, p_limit int, p_offset int
)
returns table (artist_key text, artist text, album text, image_url text, plays bigint, total_count bigint)
language sql stable as $$
  select
    v.artist_key,
    mode() within group (order by v.artist_clean),
    mode() within group (order by v.album),
    mode() within group (order by v.cover_url) filter (where v.cover_url is not null),
    count(*) as plays,
    count(*) over ()
  from visible_plays v
  where v.played_at >= coalesce(p_from, '-infinity') and v.played_at < p_to
    and v.album <> ''
  group by v.artist_key, lower(trim(v.album))
  order by plays desc, 3 asc
  limit p_limit offset p_offset;
$$;

-- Plays per day/week/month in Asia/Jakarta time, with empty buckets filled in.
-- p_track_key is a base_track_key: the song with all its versions.
create or replace function plays_over_time(
  p_from timestamptz, p_to timestamptz, p_bucket text,
  p_artist_key text default null, p_track_key text default null
)
returns table (bucket date, plays bigint)
language sql stable as $$
  with filtered as (
    select (v.played_at at time zone 'Asia/Jakarta') as local_at
    from visible_plays v
    where v.played_at >= coalesce(p_from, '-infinity') and v.played_at < p_to
      and (p_artist_key is null or v.artist_key = p_artist_key)
      and (p_track_key is null or v.base_track_key = p_track_key)
  ),
  bounds as (
    select
      date_trunc(p_bucket, coalesce(p_from at time zone 'Asia/Jakarta', (select min(local_at) from filtered))) as lo,
      date_trunc(p_bucket, least(p_to, now()) at time zone 'Asia/Jakarta') as hi
  ),
  series as (
    select generate_series(lo, hi, ('1 ' || p_bucket)::interval) as b from bounds
  ),
  counts as (
    select date_trunc(p_bucket, local_at) as b, count(*) as c from filtered group by 1
  )
  select s.b::date, coalesce(c.c, 0)
  from series s left join counts c using (b)
  order by 1;
$$;

create or replace function artist_summary(p_artist_key text)
returns table (
  artist text, plays bigint, tracks bigint, first_played timestamptz, last_played timestamptz,
  est_seconds bigint, guessed_seconds bigint
)
language sql stable as $$
  select
    mode() within group (order by artist_clean),
    count(*),
    count(distinct track_key),
    min(played_at),
    max(played_at),
    sum(est_seconds(duration_s)),
    coalesce(sum(est_seconds(duration_s)) filter (where duration_s is null), 0)
  from visible_plays
  where artist_key = p_artist_key
  having count(*) > 0;
$$;

-- A song with all its versions (MV, lyric video, live, remixes…), keyed by
-- base_track_key. title and duration_s are the original's when it was played.
create or replace function track_summary(p_track_key text)
returns table (
  artist_key text, artist text, title text, album text, image_url text, duration_s integer,
  plays bigint, first_played timestamptz, last_played timestamptz,
  est_seconds bigint, guessed_seconds bigint
)
language sql stable as $$
  select
    mode() within group (order by v.artist_key),
    mode() within group (order by v.artist_clean),
    coalesce(
      mode() within group (order by v.title_clean) filter (where v.track_key = p_track_key),
      mode() within group (order by v.title_clean)
    ),
    mode() within group (order by v.album) filter (where v.album <> ''),
    mode() within group (order by v.cover_url) filter (where v.cover_url is not null),
    mode() within group (order by v.duration_s) filter (where v.track_key = p_track_key and v.duration_s is not null),
    count(*),
    min(v.played_at),
    max(v.played_at),
    sum(est_seconds(v.duration_s)),
    coalesce(sum(est_seconds(v.duration_s)) filter (where v.duration_s is null), 0)
  from visible_plays v
  where v.base_track_key = p_track_key
  having count(*) > 0;
$$;

-- Plays of a song by version. Remixes and edits are their own track_key, so
-- each one is a row of its own. example: the most common name as received.
create or replace function track_versions(p_track_key text, p_from timestamptz, p_to timestamptz)
returns table (track_key text, version_type text, title text, example text, plays bigint)
language sql stable as $$
  select
    v.track_key,
    v.version_type,
    mode() within group (order by v.title_clean),
    mode() within group (order by v.artist_raw || ' – ' || v.title_raw),
    count(*) as plays
  from visible_plays v
  where v.base_track_key = p_track_key
    and v.played_at >= coalesce(p_from, '-infinity') and v.played_at < p_to
  group by v.track_key, v.version_type
  order by v.track_key <> p_track_key, plays desc;
$$;

-- ---------------------------------------------------------------------------
-- Merging (the Merge page). A merge is a manual fix: fix_track / fix_artist.
-- ---------------------------------------------------------------------------

-- "50%_off" -> '%50\%\_off%', for ILIKE.
create or replace function like_pattern(p_query text)
returns text
language sql immutable as $$
  select '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

-- Artists or tracks whose name, as shown or as received, contains p_query.
-- title is null for artists.
create or replace function search_entries(p_kind text, p_query text, p_limit int)
returns table (key text, artist_key text, artist text, title text, plays bigint)
language sql stable as $$
  select
    case when p_kind = 'artist' then v.artist_key else v.track_key end,
    mode() within group (order by v.artist_key),
    mode() within group (order by v.artist_clean),
    case when p_kind = 'track' then mode() within group (order by v.title_clean) end,
    count(*) as plays
  from visible_plays v
  group by 1
  having bool_or(
    v.artist_clean ilike like_pattern(p_query) or v.artist_raw ilike like_pattern(p_query)
    or (p_kind = 'track' and (v.title_clean ilike like_pattern(p_query) or v.title_raw ilike like_pattern(p_query)))
  )
  order by plays desc
  limit p_limit;
$$;

-- Entries that are probably the same, each paired with the one to merge into:
-- - artists whose names differ only in spaces and punctuation ("Red Velvet" /
--   "RedVelvet"), merged into the most played spelling;
-- - tracks by one artist whose titles differ only that way;
-- - tracks credited to a label channel (artist_unknown, not fixed yet) with the
--   same title as a real artist's track ("Genie Music – Drama" -> "aespa – Drama").
-- Pairs dismissed as "not the same" are left out.
create or replace function merge_suggestions(p_limit int)
returns table (
  kind text, from_key text, from_artist text, from_title text, from_plays bigint,
  to_key text, to_artist text, to_title text, to_plays bigint
)
language sql stable as $$
  with artists as (
    select
      v.artist_key,
      mode() within group (order by v.artist_clean) as artist,
      count(*) as plays,
      regexp_replace(v.artist_key, '[[:space:][:punct:]]', '', 'g') as compact
    from visible_plays v
    group by v.artist_key
  ),
  ranked_artists as (
    select a.*, row_number() over (partition by a.compact order by a.plays desc, a.artist_key) as rn
    from artists a
    where a.compact <> ''
  ),
  tracks as (
    select
      v.track_key,
      v.artist_key,
      mode() within group (order by v.artist_clean) as artist,
      mode() within group (order by v.title_clean) as title,
      count(*) as plays,
      -- A fixed play keeps artist_unknown, but its artist_key no longer
      -- matches the uploader's.
      bool_or(v.artist_unknown and v.artist_key = v.lookup_artist_key) as unknown,
      regexp_replace(substr(v.track_key, length(v.artist_key) + 2), '[[:space:][:punct:]]', '', 'g') as compact
    from visible_plays v
    group by v.track_key, v.artist_key
  ),
  pairs as (
    select
      'artist' as kind, f.artist_key as from_key, f.artist as from_artist, null::text as from_title,
      f.plays as from_plays, t.artist_key as to_key, t.artist as to_artist, null::text as to_title,
      t.plays as to_plays
    from ranked_artists f
    join ranked_artists t on t.compact = f.compact and t.rn = 1
    where f.rn > 1
    union all
    select * from (
      select distinct on (f.track_key)
        'track', f.track_key, f.artist, f.title, f.plays, t.track_key, t.artist, t.title, t.plays
      from tracks f
      join tracks t
        on t.compact = f.compact and t.track_key <> f.track_key and not t.unknown
       and (f.unknown or (t.artist_key = f.artist_key and (t.plays, t.track_key) > (f.plays, f.track_key)))
      where f.compact <> ''
      order by f.track_key, t.plays desc, t.track_key
    ) track_pairs
  )
  select p.*
  from pairs p
  where not exists (
    select 1 from merge_dismissals d
    where d.kind = p.kind and d.from_key = p.from_key and d.to_key = p.to_key
  )
  order by p.from_plays desc, p.from_key
  limit p_limit;
$$;

-- Tracks flagged "maybe not music", newest first. Hidden ones are left out.
-- by_title: flagged by title words (teaser, reaction…), else not found by lookup.
create or replace function tracks_to_review(p_limit int, p_offset int)
returns table (
  track_key text, artist_key text, artist text, title text, raw_name text,
  by_title boolean, plays bigint, last_played timestamptz, total_count bigint
)
language sql stable as $$
  select
    v.track_key,
    mode() within group (order by v.artist_key),
    mode() within group (order by v.artist_clean),
    mode() within group (order by v.title_clean),
    mode() within group (order by v.artist_raw || ' – ' || v.title_raw),
    bool_or(v.maybe_not_music),
    count(*),
    max(v.played_at) as last_played,
    count(*) over ()
  from plays_with_status v
  where v.needs_review and not v.is_blocked
  group by v.track_key
  order by last_played desc
  limit p_limit offset p_offset;
$$;

-- ---------------------------------------------------------------------------
-- Cover lookups: most-played first. Misses are retried after 30 days.
-- ---------------------------------------------------------------------------

create or replace function tracks_needing_cover(p_limit int)
returns table (track_key text, artist text, title text)
language sql stable as $$
  select
    v.track_key,
    mode() within group (order by v.artist_clean),
    mode() within group (order by v.title_clean)
  from visible_plays v
  left join tracks t on t.track_key = v.track_key
  where t.image_checked_at is null
     or (t.image_url is null and t.image_checked_at < now() - interval '30 days')
  group by v.track_key
  having bool_and(v.image_url is null)
  order by count(*) desc
  limit p_limit;
$$;

-- tracks: the artist's songs in my plays, used to confirm a Deezer match.
drop function if exists artists_needing_image(int);
create or replace function artists_needing_image(p_limit int)
returns table (artist_key text, artist text, tracks jsonb)
language sql stable as $$
  select
    v.artist_key,
    mode() within group (order by v.artist_clean),
    jsonb_agg(distinct jsonb_build_object('track_key', v.track_key, 'title', v.title_clean))
  from visible_plays v
  left join artists a on a.artist_key = v.artist_key
  where a.image_checked_at is null
     or (a.image_url is null and a.image_checked_at < now() - interval '30 days')
  group by v.artist_key
  order by count(*) desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only the server-side secret key (service_role) may use anything.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
