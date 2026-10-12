import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { FilterBar } from "@/components/ui/Toolbar";
import { UrlSelect } from "@/components/ui/UrlSelect";
import type { UrlOption } from "@/components/ui/url-options";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import { ActionTable } from "@/components/tindak-lanjut/ActionTable";
import { AddActionItemButton } from "@/components/tindak-lanjut/AddActionItemButton";
import {
  ACTION_GROUPS,
  ACTION_STATUSES,
  ASPECTS,
  byUrgency,
  matchesFilters,
  parseAspect,
  parseGroup,
  parseStatus,
  toActionView,
} from "@/components/tindak-lanjut/action-view";
import { firstParam, hrefs, type ScreenProps } from "@/lib/workspace";

const TITLE = "Tindak Lanjut";
const ALL = "semua";

export function TindakLanjutLoading() {
  return <PageLoading title={TITLE} label="Memuat tindak lanjut" />;
}

/**
 * The national action items, most urgent first (OVERDUE, jatuh tempo, no due date).
 * KPS links and the owner update progress in a dialog; the owner also adds and deletes
 * items. Station links reach this page by URL only and get a read-only list.
 */
export function TindakLanjutScreen({ access, ws, searchParams }: ScreenProps) {
  const today = todayInJakarta();
  const canEdit = ws.isKps;
  const isOwner = access.kind === "owner" && ws.isOwner;
  const links = hrefs(access);

  const all = ws.actionItems.map((item) => toActionView(item, today, ws));
  const filters = {
    group: parseGroup(firstParam(searchParams.kelompok)),
    aspect: parseAspect(firstParam(searchParams.aspek)),
    status: parseStatus(firstParam(searchParams.status)),
  };
  const items = all.filter((v) => matchesFilters(v, filters)).sort(byUrgency);
  const filtered = Boolean(filters.group || filters.aspect || filters.status);

  const overdue = all.filter((v) => v.flag === "OVERDUE").length;
  const dueSoon = all.filter((v) => v.flag === "Jatuh tempo ≤ 7 hari").length;

  const query = { kelompok: filters.group, aspek: filters.aspect, status: filters.status };
  const options = (key: keyof typeof query, allLabel: string, values: readonly string[]): UrlOption[] =>
    [ALL, ...values].map((value) => ({
      value,
      label: value === ALL ? allLabel : value,
      href: links.to("tindakLanjut", { ...query, [key]: value === ALL ? null : value }),
    }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={TITLE}
        meta={`${all.length} butir · ${overdue} OVERDUE · ${dueSoon} jatuh tempo ≤ 7 hari`}
        actions={
          isOwner ? (
            <AddActionItemButton
              accessKey={access.key}
              existing={all.map((v) => ({ code: v.code, groupName: v.groupName }))}
              defaultGroup={filters.group}
            />
          ) : undefined
        }
      >
        <FilterBar label="Filter tindak lanjut" end={<span className="tabular">{`${items.length} dari ${all.length} butir`}</span>}>
          <UrlSelect label="Kelompok" options={options("kelompok", "Semua kelompok", ACTION_GROUPS)} current={filters.group ?? ALL} />
          <UrlSelect label="Aspek" options={options("aspek", "Semua aspek", ASPECTS)} current={filters.aspect || ALL} />
          <UrlSelect
            label="Status"
            width="w-full sm:w-44"
            options={options("status", "Semua status", ACTION_STATUSES)}
            current={filters.status || ALL}
          />
        </FilterBar>
      </PageHeader>

      <Panel padding="flush">
        <ActionTable
          accessKey={access.key}
          canEdit={canEdit}
          isOwner={isOwner}
          today={today}
          items={items}
          emptyTitle={filtered ? "Tidak ada butir dengan filter ini" : "Belum ada butir tindak lanjut"}
        />
      </Panel>
    </div>
  );
}
