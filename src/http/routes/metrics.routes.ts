import type { FastifyInstance } from "fastify";

import { verifyInternalSecret } from "../plugins/internal-auth.js";

export async function metricsRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    "/",
    {
      preHandler: verifyInternalSecret,
    },
    async (_request, reply) => {
      const metrics = await server.workerRuntime.getMetrics();

      reply.send({
        ok: true,
        ...metrics,
      });
    },
  );
}
