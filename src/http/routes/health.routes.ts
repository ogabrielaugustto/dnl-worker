import type { FastifyInstance } from "fastify";

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get("/health", async () => ({
    ok: true,
    service: "dnl-worker",
    timestamp: new Date().toISOString(),
  }));
}
