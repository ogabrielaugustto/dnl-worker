import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { buildServer } from "./http/server.js";
import { WorkerRuntime } from "./modules/jobs/worker-runtime.js";

async function startServer(): Promise<void> {
  const runtime = new WorkerRuntime(logger);
  await runtime.start();

  const server = await buildServer(runtime);

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info({ event: "shutdown_started", signal }, "Shutdown started");

    await Promise.allSettled([server.close(), runtime.stop()]);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await server.listen({
      host: "0.0.0.0",
      port: env.PORT,
    });

    server.log.info(
      {
        event: "server_started",
        port: env.PORT,
        environment: env.NODE_ENV,
        workerId: env.WORKER_ID,
      },
      "Server started",
    );
  } catch (error) {
    server.log.error({ error }, "Failed to start server");
    await runtime.stop();
    process.exit(1);
  }
}

void startServer();
