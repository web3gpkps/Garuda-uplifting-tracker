import type { ReactNode } from "react";
import type { Workspace } from "@/lib/workspace";
import { navSections, type WorkspaceAccess } from "@/lib/workspace/access";
import { ShellFrame, ShellIdentity, ShellLoading, WeekLine } from "./ShellFrame";
import { programmeWeekLine } from "./programme-calendar";
import { cgkBmiNavigation, isCgkBmiShare } from "./cgk-bmi";

type WorkspaceShellProps = {
  access: WorkspaceAccess;
  workspace: Workspace;
  /** Today in Asia/Jakarta, from todayInJakarta() at request time. */
  today: string;
  children: ReactNode;
};

/**
 * Station link chrome (/s/<token>, no account). The scope ("Stasiun CGK" / "KPS · semua
 * stasiun") and the programme week sit under the logos; the link's label is the footer.
 * Tindak Lanjut is in the nav for KPS links only.
 */
export function WorkspaceShell({ access, workspace, today, children }: WorkspaceShellProps) {
  const bmiOnly = isCgkBmiShare(access, workspace);
  const sections = navSections(access, workspace.isKps);
  return (
    <ShellFrame
      sections={bmiOnly ? cgkBmiNavigation(sections) : sections}
      homeHref={bmiOnly ? `${access.basePath}/bmi` : access.basePath}
      scopeLabel={workspace.scopeLabel}
      scopeShort={workspace.scope}
      weekLine={workspace.schedule ? <WeekLine>{programmeWeekLine(workspace.schedule, today)}</WeekLine> : undefined}
      footer={workspace.label ? <ShellIdentity icon="link" text={`Tautan: ${workspace.label}`} /> : undefined}
    >
      {children}
    </ShellFrame>
  );
}

export function WorkspaceShellLoading() {
  return <ShellLoading scopeLabel="Membuka halaman" />;
}
