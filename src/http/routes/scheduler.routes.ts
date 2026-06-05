import type { FastifyInstance } from "fastify";

import { verifyInternalSecret } from "../plugins/internal-auth.js";

export async function schedulerRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    "/run",
    {
      preHandler: verifyInternalSecret,
    },
    async (_request, reply) => {
      const result = await server.workerRuntime.runScheduler();

      reply.send({
        ok: true,
        ...result,
      });
    },
  );
}
