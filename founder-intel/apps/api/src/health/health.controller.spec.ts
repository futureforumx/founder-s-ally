import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

const mockHealthService = {
  check: jest.fn().mockResolvedValue({
    status: "ok",
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: "ok", latencyMs: 2 },
      redis: { status: "ok", latencyMs: 1 },
      workers: { status: "ok", activeJobs: 0, waitingJobs: 0 },
    },
  }),
};

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("should return ok health status", async () => {
    const result = await controller.check();
    expect(result.status).toBe("ok");
    expect(result.checks.database.status).toBe("ok");
    expect(result.checks.redis.status).toBe("ok");
  });
});
