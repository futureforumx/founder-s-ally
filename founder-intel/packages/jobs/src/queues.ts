import { Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";

// ─── Redis connection ─────────────────────────────────────────────────────────

export function createRedisConnection(): IORedis {
  const host = process.env.REDIS_HOST ?? "localhost";
  const port = parseInt(process.env.REDIS_PORT ?? "6379", 10);

  return new IORedis({
    host,
    port,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

// ─── Queue names ──────────────────────────────────────────────────────────────

export const INGESTION_QUEUE = "ingestion";
export const ENRICHMENT_QUEUE = "enrichment";

// ─── Queue factories ──────────────────────────────────────────────────────────

export function createIngestionQueue(connection: IORedis): Queue {
  return new Queue(INGESTION_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
}

export function createEnrichmentQueue(connection: IORedis): Queue {
  return new Queue(ENRICHMENT_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "fixed", delay: 10_000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  });
}

export function createQueueEvents(queueName: string, connection: IORedis): QueueEvents {
  return new QueueEvents(queueName, { connection });
}

// ─── Job data types ───────────────────────────────────────────────────────────

export interface IngestionJobData {
  source: string;
  jobDbId: string; // IngestionJob.id in Postgres — for status tracking
  triggeredBy?: string;
  options?: {
    maxPages?: number;
    dryRun?: boolean;
  };
}

export interface EnrichmentJobData {
  entityType: "organization" | "person";
  entityId: string;
}
