/**
 * Seeds one approved branch account per station (public.stations), for testing and first rollout.
 *
 *   SEED_PASSWORD='...' bun scripts/seed-station-accounts.ts            # create what is missing
 *   SEED_PASSWORD='...' bun scripts/seed-station-accounts.ts --dry-run  # list only
 *
 * Email: <kode station huruf kecil>@gapura.id (accounts are seeded with the e-mail already confirmed; password
 * recovery mails reach that mailbox, so only seed addresses that exist).
 * Accounts are created with the e-mail already confirmed and are set `active` for their own station.
 * Existing accounts are left alone (nothing is overwritten). The password comes from the environment,
 * never from this file. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side secrets).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;
const dryRun = process.argv.includes("--dry-run");

if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
if (!dryRun && !password) throw new Error("SEED_PASSWORD must be set.");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: stations, error } = await db.from("stations").select("code").order("sort").order("code");
if (error || !stations) throw new Error(`stations: ${error?.message ?? "no data"}`);

const existing = new Set<string>();
for (let page = 1; ; page++) {
  const { data, error: listError } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (listError) throw new Error(`listUsers: ${listError.message}`);
  for (const u of data.users) if (u.email) existing.add(u.email.toLowerCase());
  if (data.users.length < 1000) break;
}

let created = 0;
let skipped = 0;
for (const { code } of stations) {
  const email = `${code.toLowerCase()}@gapura.id`;
  if (existing.has(email)) {
    skipped++;
    console.log(`skip    ${code}  ${email} (already exists)`);
    continue;
  }
  if (dryRun) {
    console.log(`would   ${code}  ${email}`);
    continue;
  }
  const { data, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Akun Stasiun ${code}`, branch_code: code },
  });
  if (createError || !data.user) {
    console.log(`FAILED  ${code}  ${email}: ${createError?.message ?? "no user"}`);
    continue;
  }
  // The sign-up trigger made the profile `pending`; the seed approves it.
  const { error: approveError } = await db.from("profiles").update({ status: "active" }).eq("id", data.user.id);
  if (approveError) {
    console.log(`PENDING ${code}  ${email}: created but not approved (${approveError.message})`);
    continue;
  }
  created++;
  console.log(`created ${code}  ${email}`);
}
console.log(`\n${created} created, ${skipped} skipped, ${stations.length} stations.`);
