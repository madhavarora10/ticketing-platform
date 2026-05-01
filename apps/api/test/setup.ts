// Loaded by Jest before any test module is imported (setupFiles in jest.config.json).
// This mirrors what `tsx --env-file .env` does for the dev server.
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env");

try {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // Don't overwrite vars already set in the real environment
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // .env is optional in CI — environment variables should already be set
}
