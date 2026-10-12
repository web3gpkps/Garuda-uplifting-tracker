import type { TodoItem } from "@/lib/dashboard";
import type { SheetLinks } from "@/lib/workspace/access";
import { ButtonLink } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";

/**
 * This week's work for one station: one line per job with its count and one button to the
 * filtered screen. The first open line gets the primary button. Lines are at least 48px.
 */
export function TodoList({ items, links }: { items: TodoItem[]; links: SheetLinks }) {
  const firstOpen = items.findIndex((i) => i.state === "todo");
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((item, index) => (
        <li key={item.key} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
              <span className="tabular">{item.detail}</span>
              {item.late > 0 ? <StatusChip label={`${item.late} terlambat cek`} tone="critical" /> : null}
              {item.state === "done" ? <StatusChip label="Selesai" tone="good" /> : null}
            </p>
          </div>
          <ButtonLink
            href={links.to(item.link.sheet, item.link.query)}
            variant={index === firstOpen ? "primary" : "secondary"}
            size="sm"
          >
            {item.action}
          </ButtonLink>
        </li>
      ))}
    </ul>
  );
}
