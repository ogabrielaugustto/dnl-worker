import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { env } from "../config/env.js";
import { healthRoutes } from "./routes/health.routes.js";
import { screenshotsRoutes } from "./routes/screenshots.routes.js";
import { visionRoutes } from "./routes/vision.routes.js";

export async function buildServer(): Promise<FastifyInstance> {
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

  await server.register(cors, {
    origin: false,
  });

  await server.register(healthRoutes);
  await server.register(visionRoutes, { prefix: "/internal/vision" });
  await server.register(screenshotsRoutes, { prefix: "/internal/screenshots" });

  return server;
}
