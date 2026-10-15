/**
 * Gives every station account its own random password and writes the list to a CSV.
 *
 *   bun scripts/reset-station-passwords.ts [--dry-run] [--out scripts/out/akun-stasiun.csv]
 *
 * Only the accounts made by scripts/seed-station-accounts.ts are touched: e-mail
 * <station code in lower case>@gapura.id whose profile belongs to that same station. Nobody else's
 * password changes. The CSV is the only place the passwords appear, so keep it under scripts/out
 * (gitignored), hand it over once, and delete it. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");

const dryRun = process.argv.includes("--dry-run");
const outIndex = process.argv.indexOf("--out");
const out = outIndex > 0 ? process.argv[outIndex + 1] : "scripts/out/akun-stasiun-kata-sandi.csv";

// No 0/O, 1/l/I: the list is read off a page and typed on a phone.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const ALL = UPPER + LOWER + DIGIT;
const pick = (set: string) => set[randomInt(set.length)];

function password(length = 12): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: stations, error } = await db.from("stations").select("code").order("sort").order("code");
if (error || !stations) throw new Error(`stations: ${error?.message ?? "no data"}`);
const { data: profiles, error: profileError } = await db.from("profiles").select("id, email, branch_code, status");
if (profileError || !profiles) throw new Error(`profiles: ${profileError?.message ?? "no data"}`);

const lines = ["Stasiun,Email,Kata sandi"];
let changed = 0;
for (const { code } of stations) {
  const email = `${code.toLowerCase()}@gapura.id`;
  const profile = profiles.find((p) => p.email.toLowerCase() === email && p.branch_code === code);
  if (!profile) {
    console.log(`skip    ${code}  ${email} (no seeded account)`);
    continue;
  }
  const secret = password();
  if (!dryRun) {
    const { error: updateError } = await db.auth.admin.updateUserById(profile.id, { password: secret });
    if (updateError) {
      console.log(`FAILED  ${code}  ${email}: ${updateError.message}`);
      continue;
    }
  }
  lines.push(`${code},${email},${secret}`);
  changed++;
  console.log(`${dryRun ? "would   " : "changed "} ${code}  ${email}`);
}

if (!dryRun && changed > 0) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\r\n") + "\r\n", "utf8");
  console.log(`\nList written to ${out}`);
}
console.log(`${changed} ${dryRun ? "would change" : "changed"}, ${stations.length} stations.`);
