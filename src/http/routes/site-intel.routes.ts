import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { verifyInternalSecret } from "../plugins/internal-auth.js";
import { AppError } from "../../modules/shared/errors.js";

const siteIntelParamsSchema = z.object({
  id: z.string().uuid(),
});

const siteIntelBodySchema = z
  .object({
    force: z.boolean().optional(),
  })
  .default({});

export async function siteIntelRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    "/:id/run",
    {
      preHandler: verifyInternalSecret,
    },
    async (request, reply) => {
      const parsedParams = siteIntelParamsSchema.safeParse(request.params);
      const parsedBody = siteIntelBodySchema.safeParse(request.body ?? {});

      if (!parsedParams.success) {
        reply.status(400).send({
          ok: false,
          message: "Invalid detection id",
          issues: parsedParams.error.issues,
        });
        return;
      }

      if (!parsedBody.success) {
        reply.status(400).send({
          ok: false,
          message: "Invalid request payload",
          issues: parsedBody.error.issues,
        });
        return;
      }

      try {
        const result = await server.workerRuntime.enqueueSiteIntelInvestigation(
          parsedParams.data.id,
          parsedBody.data.force ?? false,
        );

        reply.status(202).send({
          ok: true,
          detectionId: parsedParams.data.id,
          status: result.status,
        });
      } catch (error) {
        if (error instanceof AppError) {
          reply.status(error.statusCode).send({
            ok: false,
            message: error.message,
            code: error.code,
          });
          return;
        }

        reply.status(500).send({
          ok: false,
          message: error instanceof Error ? error.message : "Failed to enqueue site intel investigation",
        });
      }
    },
  );
}
