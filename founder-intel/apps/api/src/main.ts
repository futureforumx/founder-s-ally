import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "warn", "error", "debug"],
  });

  const logger = new Logger("Bootstrap");

  // ── Global prefix ────────────────────────────────────────────────────────
  const prefix = process.env.API_PREFIX ?? "api/v1";
  app.setGlobalPrefix(prefix);

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 API running at http://localhost:${port}/${prefix}`);
  logger.log(`🏥 Health: http://localhost:${port}/${prefix}/health`);
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error:", err);
  process.exit(1);
});
