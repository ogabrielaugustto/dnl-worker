import type { FastifyInstance } from "fastify";

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get("/health", async (_request, reply) => {
    const health = await server.workerRuntime.getHealth();
    const statusCode = health.ok ? 200 : 503;

    reply.status(statusCode).send(health);
  });
}
