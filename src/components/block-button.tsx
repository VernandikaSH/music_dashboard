import { block, unblock } from "@/app/actions";
import type { BlockKind } from "@/lib/data";

// A one-click form. Works without JavaScript; the Server Action re-checks login.
export function BlockButton({
  kind,
  value,
  label,
  blocked,
  className = "",
}: {
  kind: BlockKind;
  value: string;
  label: string;
  blocked: boolean;
  className?: string;
}) {
  return (
    <form action={blocked ? unblock : block} className={className}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="value" value={value} />
      <input type="hidden" name="label" value={label} />
      <button
        type="submit"
        title={blocked ? `Show this ${kind} in charts again` : `Hide this ${kind} from all charts`}
        className={`rounded-md border-2 px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
          blocked
            ? "border-cobalt text-cobalt hover:bg-cobalt-soft"
            : "border-hair text-muted hover:border-danger hover:text-danger"
        }`}
      >
        {blocked ? `Unhide ${kind}` : `Hide ${kind}`}
      </button>
    </form>
  );
}
