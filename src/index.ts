import { env } from "./config/env.js";
import { buildServer } from "./http/server.js";

async function startServer(): Promise<void> {
  const server = await buildServer();

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
      },
      "Server started",
    );
  } catch (error) {
    server.log.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

void startServer();
