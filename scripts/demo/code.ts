// Prints the current superadmin MFA code for the LOCAL demo (secret from the seed credentials file).
import { readFileSync } from "node:fs";
import { totp } from "../../tests/support/totp";

const creds = JSON.parse(readFileSync(".secrets/seed-credentials.json", "utf8")) as { superadmin_totp_secret: string };
const left = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`${totp(creds.superadmin_totp_secret)}  (действует ещё ${left} с)`);
