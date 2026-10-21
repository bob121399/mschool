import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "@/lib/config";

// Onboarding nonce (spec 5.4 POST /api/onboarding/trial): server-issued, bound to the Auth user,
// valid for one hour. Keyed with a derivation of the server secret; never sent to logs.
function sign(payload: string): string {
  return createHmac("sha256", `mschool-onboarding:${requiredEnv("SUPABASE_SECRET_KEY")}`).update(payload).digest("base64url");
}

export function issueOnboardingNonce(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyOnboardingNonce(nonce: string, userId: string, now = Date.now()): boolean {
  const parts = nonce.split(".");
  if (parts.length !== 3) return false;
  const [uid, ts, mac] = parts as [string, string, string];
  if (uid !== userId || !/^\d{10,16}$/u.test(ts)) return false;
  const age = now - Number(ts);
  if (age < 0 || age > 60 * 60 * 1000) return false;
  const expected = Buffer.from(sign(`${uid}.${ts}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
