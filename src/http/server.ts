import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { env } from "../config/env.js";
import { healthRoutes } from "./routes/health.routes.js";
import { screenshotsRoutes } from "./routes/screenshots.routes.js";
import { visionRoutes } from "./routes/vision.routes.js";
import { jobsRoutes } from "./routes/jobs.routes.js";
import { schedulerRoutes } from "./routes/scheduler.routes.js";
import { metricsRoutes } from "./routes/metrics.routes.js";
import { waybackRoutes } from "./routes/wayback.routes.js";
import type { WorkerRuntime } from "../modules/jobs/worker-runtime.js";

export async function buildServer(runtime: WorkerRuntime): Promise<FastifyInstance> {
  const server = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
              },
            },
          }
        : true,
  });

  server.decorate("workerRuntime", runtime);

  await server.register(cors, {
    origin: false,
  });

  await server.register(healthRoutes);
  await server.register(metricsRoutes, { prefix: "/internal/metrics" });
  await server.register(schedulerRoutes, { prefix: "/internal/scheduler" });
  await server.register(jobsRoutes, { prefix: "/internal/jobs" });
  await server.register(visionRoutes, { prefix: "/internal/vision" });
  await server.register(screenshotsRoutes, { prefix: "/internal/screenshots" });
  await server.register(waybackRoutes, { prefix: "/internal/wayback" });

  return server;
}
