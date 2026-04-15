/**
 * logger.ts — lightweight structured logger.
 * Writes JSON lines to stdout. Supports .child() context binding.
 */

import type { Logger } from "./types";

function log(level: string, bindings: Record<string, unknown>, msg: string, meta?: Record<string, unknown>): void {
  const record = {
    t: new Date().toISOString(),
    level,
    msg,
    ...bindings,
    ...(meta ?? {}),
  };
  // stdout for debug/info, stderr for warn/error
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(record) + "\n");
}

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (msg, meta) => log("debug", bindings, msg, meta),
    info:  (msg, meta) => log("info",  bindings, msg, meta),
    warn:  (msg, meta) => log("warn",  bindings, msg, meta),
    error: (msg, meta) => log("error", bindings, msg, meta),
    child: (more)      => createLogger({ ...bindings, ...more }),
  };
}
