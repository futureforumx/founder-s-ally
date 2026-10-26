// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

type ViteConfigFactory = (env: {
  command: "serve" | "build";
  mode: string;
}) => Promise<{ cacheDir?: string; server?: { strictPort?: boolean } }>;

async function resolveConfig(env: { command: "serve" | "build"; mode: string }) {
  const mod = await import("../../vite.config");
  const factory = mod.default as unknown as ViteConfigFactory;
  return factory(env);
}

const originalPort = process.env.DEV_PORT;

afterEach(() => {
  if (originalPort === undefined) delete process.env.DEV_PORT;
  else process.env.DEV_PORT = originalPort;
});

describe("dev server dep cache", () => {
  it("scopes the cache dir to the dev port so two servers cannot clobber each other", async () => {
    process.env.DEV_PORT = "5173";
    const first = await resolveConfig({ command: "serve", mode: "development" });

    process.env.DEV_PORT = "4173";
    const second = await resolveConfig({ command: "serve", mode: "development" });

    expect(first.cacheDir).toMatch(/node_modules\/\.vite\/dev-5173$/);
    expect(second.cacheDir).toMatch(/node_modules\/\.vite\/dev-4173$/);
    expect(first.cacheDir).not.toBe(second.cacheDir);
  });

  it("refuses to move the dev server to a neighbouring port", async () => {
    const config = await resolveConfig({ command: "serve", mode: "development" });
    expect(config.server?.strictPort).toBe(true);
  });

  it("leaves the build cache at the default location", async () => {
    const config = await resolveConfig({ command: "build", mode: "production" });
    expect(config.cacheDir).toBeUndefined();
  });

  it("starts the Playwright dev server on its own cache dir", async () => {
    const source = await readFile(new URL("../../playwright.config.ts", import.meta.url), "utf8");
    expect(source).toMatch(/command: `DEV_PORT=\$\{port\}/);
  });
});
