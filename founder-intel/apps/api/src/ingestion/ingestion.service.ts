import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../config/prisma.service";
import { buildAdapterRegistry } from "@founder-intel/adapters";
import {
  createRedisConnection,
  createIngestionQueue,
  INGESTION_QUEUE,
  IngestionJobData,
} from "@founder-intel/jobs";
import type { IngestionJobDto } from "@founder-intel/types";
import type { RunIngestionDto } from "./dto/run-ingestion.dto";
import type IORedis from "ioredis";
import { Queue } from "bullmq";
import { Worker } from "bullmq";
import { processIngestionJob } from "@founder-intel/jobs";

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly registry = buildAdapterRegistry();
  private readonly redis: IORedis;
  private readonly queue: Queue;
  private readonly worker: Worker<IngestionJobData>;

  constructor(private readonly prisma: PrismaService) {
    this.redis = createRedisConnection();
    this.queue = createIngestionQueue(this.redis);

    // ── Spin up in-process worker ───────────────────────────────────────────
    this.worker = new Worker<IngestionJobData>(
      INGESTION_QUEUE,
      async (job) => {
        await processIngestionJob(job, this.prisma);
      },
      {
        connection: createRedisConnection(),
        concurrency: 1, // One ingestion at a time
      }
    );

    this.worker.on("completed", (job) => {
      this.logger.log(`Job ${job.id} completed`);
    });
    this.worker.on("failed", (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });
  }

  async triggerRun(dto: RunIngestionDto, triggeredBy = "api"): Promise<IngestionJobDto> {
    const adapter = this.registry.get(dto.source);
    if (!adapter) {
      throw new NotFoundException(`Unknown source adapter: ${dto.source}`);
    }
    if (!adapter.enabled) {
      throw new BadRequestException(`Adapter ${dto.source} is disabled`);
    }

    // Create DB job record first
    const dbJob = await this.prisma.ingestionJob.create({
      data: {
        sourceAdapter: dto.source,
        status: "pending",
        triggeredBy,
      },
    });

    // Enqueue BullMQ job
    const bullJob = await this.queue.add(
      `ingest:${dto.source}`,
      {
        source: dto.source,
        jobDbId: dbJob.id,
        triggeredBy,
        options: { maxPages: dto.maxPages, dryRun: dto.dryRun },
      } satisfies IngestionJobData,
      { jobId: `ingest:${dto.source}:${dbJob.id}` }
    );

    this.logger.log(
      `Enqueued ingestion job for ${dto.source} — DB ID: ${dbJob.id}, Bull ID: ${bullJob.id}`
    );

    return this.mapToDto(dbJob);
  }

  async listJobs(
    page = 1,
    limit = 20,
    source?: string
  ): Promise<{ data: IngestionJobDto[]; total: number }> {
    const where = source ? { sourceAdapter: source } : {};
    const [jobs, total] = await Promise.all([
      this.prisma.ingestionJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ingestionJob.count({ where }),
    ]);

    return { data: jobs.map((j) => this.mapToDto(j)), total };
  }

  async getJob(id: string): Promise<IngestionJobDto> {
    const job = await this.prisma.ingestionJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return this.mapToDto(job);
  }

  private mapToDto(job: {
    id: string;
    sourceAdapter: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    error: string | null;
    stats: unknown;
    triggeredBy: string | null;
    createdAt: Date;
  }): IngestionJobDto {
    return {
      id: job.id,
      sourceAdapter: job.sourceAdapter,
      status: job.status,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      error: job.error,
      stats: job.stats as Record<string, unknown> | null,
      triggeredBy: job.triggeredBy,
      createdAt: job.createdAt.toISOString(),
    };
  }
}
