import type { ReactNode } from "react";
import type { Workspace } from "@/lib/workspace";
import { ACCOUNT_ACCESS, navSections } from "@/lib/workspace/access";
import { ShellFooterLink, ShellFrame, ShellIdentity, ShellLoading, WeekLine } from "./ShellFrame";
import { ShellSignOut } from "./SignOutButton";
import { branchBmiNavigation, isBranchBmiView } from "./cgk-bmi";
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
 * from the URL. A single-station account sees the Cek BMI menu only ("BMI Monitoring Tracker"); KPS accounts
 * get the full set of pages (Tindak Lanjut only for KPS). Footer: the account and "Keluar".
 */
export function AccountShell({ workspace, accountName, today, children }: AccountShellProps) {
  const bmiOnly = isBranchBmiView(ACCOUNT_ACCESS, workspace);
  const sections = navSections(ACCOUNT_ACCESS, workspace.isKps);
  return (
    <ShellFrame
      sections={bmiOnly ? branchBmiNavigation(sections) : sections}
      homeHref={bmiOnly ? `${ACCOUNT_ACCESS.basePath}/bmi` : ACCOUNT_ACCESS.basePath}
      scopeLabel={workspace.scopeLabel}
      scopeShort={workspace.scope}
      weekLine={workspace.schedule ? <WeekLine>{programmeWeekLine(workspace.schedule, today)}</WeekLine> : undefined}
      footer={
        <ShellIdentity
          icon="user"
          text={accountName}
          action={
            <>
              <ShellFooterLink href="/reset-password" icon="key">
                Ganti kata sandi
              </ShellFooterLink>
              <ShellSignOut />
            </>
          }
        />
      }
    >
      {children}
    </ShellFrame>
  );
}

export function AccountShellLoading() {
  return <ShellLoading scopeLabel="Membuka halaman" />;
}
