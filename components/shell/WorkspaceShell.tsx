import type { ReactNode } from "react";
import type { Workspace } from "@/lib/workspace";
import { navSections, type WorkspaceAccess } from "@/lib/workspace/access";
import { ShellFrame, ShellLoading } from "./ShellFrame";
import { programmeWeekLine } from "./programme-calendar";

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
  return (
    <ShellFrame
      sections={navSections(access, workspace.isKps)}
      homeHref={access.basePath}
      scopeLabel={workspace.scopeLabel}
      scopeShort={workspace.scope}
      weekLine={workspace.schedule ? programmeWeekLine(workspace.schedule, today) : undefined}
      footer={
        workspace.label ? (
          <p className="truncate text-xs text-ink-muted" title={workspace.label}>
            Tautan: {workspace.label}
          </p>
        ) : undefined
      }
    >
      {children}
    </ShellFrame>
  );
}

export function WorkspaceShellLoading() {
  return <ShellLoading scopeLabel="Membuka halaman" />;
}
