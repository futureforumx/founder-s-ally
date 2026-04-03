import { PrismaClient } from "../generated/client/index";

// ─── Singleton Prisma client ──────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    errorFormat: "pretty",
  });
}

// Reuse existing client in dev to avoid exhausting connections during hot-reload
export const prisma: PrismaClient =
  global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export { PrismaClient } from "../generated/client/index.js";
export * from "../generated/client/index.js";

