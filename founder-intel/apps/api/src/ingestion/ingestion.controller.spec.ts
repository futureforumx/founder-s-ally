import { Test, TestingModule } from "@nestjs/testing";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";

const mockIngestionService = {
  triggerRun: jest.fn().mockResolvedValue({
    id: "job-123",
    sourceAdapter: "yc-companies",
    status: "pending",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    stats: null,
    triggeredBy: "api",
  }),
  listJobs: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getJob: jest.fn().mockResolvedValue({
    id: "job-123",
    sourceAdapter: "yc-companies",
    status: "completed",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    stats: null,
    triggeredBy: "api",
  }),
};

describe("IngestionController", () => {
  let controller: IngestionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestionController],
      providers: [{ provide: IngestionService, useValue: mockIngestionService }],
    }).compile();

    controller = module.get<IngestionController>(IngestionController);
  });

  describe("POST /ingestion/run", () => {
    it("should enqueue a job and return its DTO", async () => {
      const result = await controller.run({ source: "yc-companies" });
      expect(result.id).toBe("job-123");
      expect(result.status).toBe("pending");
      expect(mockIngestionService.triggerRun).toHaveBeenCalledWith(
        { source: "yc-companies" },
        "api"
      );
    });
  });

  describe("GET /ingestion/jobs", () => {
    it("should return paginated job list", async () => {
      const result = await controller.listJobs(1, 20);
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe("GET /ingestion/jobs/:id", () => {
    it("should return a single job", async () => {
      const result = await controller.getJob("job-123");
      expect(result.id).toBe("job-123");
    });
  });
});
