/**
 * Races a promise against a timeout so callers never hang indefinitely on a
 * stuck async operation (e.g. pdf.js's worker handshake failing silently
 * with no error and no resolution).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Operation timed out"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}
