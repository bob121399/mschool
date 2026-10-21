import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Integration tests read the same local env as the app (.env.local, never committed).
if (existsSync(".env.local")) loadEnvFile(".env.local");
