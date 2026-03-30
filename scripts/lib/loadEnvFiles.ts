import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadEnvFiles(fileNames: string[] = [".env", ".env.local"]): void {
  const root = process.cwd();

  for (const name of fileNames) {
    const filePath = join(root, name);
    if (!existsSync(filePath)) continue;

    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key] != null && process.env[key] !== "") continue;

      process.env[key] = stripQuotes(rawValue.trim());
    }
  }
}
