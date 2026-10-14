import type { ReactNode } from "react";
import type { Workspace } from "@/lib/workspace";
import { ACCOUNT_ACCESS, navSections } from "@/lib/workspace/access";
import { ShellFrame, ShellLoading } from "./ShellFrame";
import { SignOutButton } from "./SignOutButton";
import { programmeWeekLine } from "./programme-calendar";

type AccountShellProps = {
  workspace: Workspace;
  /** The signed-in account's name, or its e-mail when it has no name. */
  accountName: string;
  /** Today in Asia/Jakarta, from todayInJakarta() at request time. */
  today: string;
  children: ReactNode;
};

/**
 * Chrome of the branch area (/cabang), for a signed-in account approved by the owner. The scope
 * ("Stasiun CGK" or "KPS · semua stasiun") comes from the account's branch in the database, never
 * from the URL. Same pages as a station link; Tindak Lanjut only for KPS. Footer: the account and "Keluar".
 */
export function AccountShell({ workspace, accountName, today, children }: AccountShellProps) {
  return (
    <ShellFrame
      sections={navSections(ACCOUNT_ACCESS, workspace.isKps)}
      homeHref={ACCOUNT_ACCESS.basePath}
      scopeLabel={workspace.scopeLabel}
      scopeShort={workspace.scope}
      weekLine={workspace.schedule ? programmeWeekLine(workspace.schedule, today) : undefined}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-[#b6ced4]" title={accountName}>
            {accountName}
          </span>
          <SignOutButton variant="ghost" size="sm" />
        </div>
      }
    >
      {children}
    </ShellFrame>
  );
}

export function AccountShellLoading() {
  return <ShellLoading scopeLabel="Membuka halaman" />;
}
