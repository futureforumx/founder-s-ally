import type { Prisma, PrismaClient } from "@prisma/client";

export type DeadLetterInput = {
  targetTable: string;
  targetId?: string | null;
  failedOperation: string;
  errorMessage?: string | null;
  rawPayload?: Prisma.InputJsonValue;
};

/**
 * Best-effort DLQ write: never throw from caller's catch-path.
 */
export async function enqueueDeadLetter(prisma: PrismaClient, input: DeadLetterInput): Promise<void> {
  try {
    await prisma.deadLetterQueue.create({
      data: {
        target_table: input.targetTable,
        target_id: input.targetId ?? null,
        failed_operation: input.failedOperation,
        error_message: input.errorMessage ?? null,
        ...(input.rawPayload !== undefined ? { raw_payload: input.rawPayload } : {}),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[DLQ write failed] ${msg}`);
  }
}

export function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function toJsonPayload(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
  } catch {
    return { value: String(v) } as Prisma.InputJsonValue;
  }
}
