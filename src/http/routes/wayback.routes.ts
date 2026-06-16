import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { verifyInternalSecret } from "../plugins/internal-auth.js";
import { archiveUrlInWayback } from "../../services/wayback.service.js";

const waybackTestBodySchema = z.object({
  url: z.url(),
});

export async function waybackRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    "/test",
    {
      preHandler: verifyInternalSecret,
    },
    async (request, reply) => {
      const parsedBody = waybackTestBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        reply.status(400).send({
          ok: false,
          message: "Invalid request payload",
          issues: parsedBody.error.issues,
        });
        return;
      }

      const { url } = parsedBody.data;

      request.log.info({ event: "wayback_test_started", url }, "Wayback test started");

      try {
        const result = await archiveUrlInWayback(url);

        return {
          ok: true,
          url,
          result,
        };
      } catch (error) {
        request.log.error(
          {
            event: "wayback_test_failed",
            url,
            errorType: error instanceof Error ? error.name : "unknown_error",
          },
          "Wayback test failed",
        );

        reply.status(500).send({
          ok: false,
          message: error instanceof Error ? error.message : "Failed to archive URL in Wayback",
        });
      }
    },
  );
}
