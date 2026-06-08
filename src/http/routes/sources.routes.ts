import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { verifyInternalSecret } from "../plugins/internal-auth.js";

const sourceIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const sourceDomainParamsSchema = z.object({
  domain: z.string().min(1),
});

export async function sourcesRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    "/domain/:domain/crawl",
    {
      preHandler: verifyInternalSecret,
    },
    async (request, reply) => {
      const parsedParams = sourceDomainParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        reply.status(400).send({
          ok: false,
          message: "Invalid source domain",
          issues: parsedParams.error.issues,
        });
        return;
      }

      const result = await server.workerRuntime.enqueueSpecificSourceCrawlByDomain(
        parsedParams.data.domain,
      );

      reply.send({
        ok: true,
        sourceId: result.sourceId,
        domain: parsedParams.data.domain,
      });
    },
  );

  server.post(
    "/:id/crawl",
    {
      preHandler: verifyInternalSecret,
    },
    async (request, reply) => {
      const parsedParams = sourceIdParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        reply.status(400).send({
          ok: false,
          message: "Invalid source id",
          issues: parsedParams.error.issues,
        });
        return;
      }

      await server.workerRuntime.enqueueSpecificSourceCrawl(parsedParams.data.id);

      reply.send({
        ok: true,
        sourceId: parsedParams.data.id,
      });
    },
  );
}
