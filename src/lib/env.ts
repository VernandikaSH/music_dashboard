import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const env = {
  get lastfmApiKey() {
    return required("LASTFM_API_KEY");
  },
  get lastfmUsername() {
    return required("LASTFM_USERNAME");
  },
  get supabaseUrl() {
    // The dashboard shows the REST URL (".../rest/v1/"); supabase-js wants the
    // bare project URL and adds /rest/v1 itself.
    return required("SUPABASE_URL").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get dashboardPassword() {
    return required("DASHBOARD_PASSWORD");
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters.");
    }
    return secret;
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
};
