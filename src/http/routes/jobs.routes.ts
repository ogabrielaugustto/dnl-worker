import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { verifyInternalSecret } from "../plugins/internal-auth.js";

const jobIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function jobsRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    "/run",
    {
      preHandler: verifyInternalSecret,
    },
    async (_request, reply) => {
      const enqueuedCount = await server.workerRuntime.enqueuePendingJobs();

      reply.send({
        ok: true,
        enqueuedCount,
      });
    },
  );

  server.post(
    "/:id/run",
    {
      preHandler: verifyInternalSecret,
    },
    async (request, reply) => {
      const parsedParams = jobIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        reply.status(400).send({
          ok: false,
          message: "Invalid job id",
          issues: parsedParams.error.issues,
        });
        return;
      }

      const result = await server.workerRuntime.enqueueSpecificJob(parsedParams.data.id);

      reply.send({
        ok: true,
        scanJobId: parsedParams.data.id,
        sourceCrawlsEnqueued: result.sourceCrawlsEnqueued,
      });
    },
  );
}
