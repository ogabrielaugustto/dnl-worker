import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { verifyInternalSecret } from "../plugins/internal-auth.js";
import {
  detectImageOnWeb,
  VisionConfigurationError,
} from "../../services/vision.service.js";

const visionTestBodySchema = z.object({
  imageUrl: z.url(),
});

export async function visionRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    "/test",
    {
      preHandler: verifyInternalSecret,
    },
    async (request, reply) => {
      const parsedBody = visionTestBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        reply.status(400).send({
          ok: false,
          message: "Invalid request payload",
          issues: parsedBody.error.issues,
        });
        return;
      }

      const { imageUrl } = parsedBody.data;

      request.log.info({ event: "vision_test_started", imageUrl }, "Vision test started");

      try {
        const result = await detectImageOnWeb(imageUrl);

        return {
          ok: true,
          imageUrl,
          result,
        };
      } catch (error) {
        if (error instanceof VisionConfigurationError) {
          request.log.warn(
            {
              event: "vision_test_failed",
              imageUrl,
              errorType: error.name,
            },
            "Vision test failed because Google Vision is not configured correctly",
          );

          reply.status(500).send({
            ok: false,
            message: error.message,
          });
          return;
        }

        request.log.error(
          {
            event: "vision_test_failed",
            imageUrl,
            errorType: error instanceof Error ? error.name : "unknown_error",
          },
          "Vision test failed",
        );

        reply.status(500).send({
          ok: false,
          message: "Failed to run Google Vision web detection",
        });
      }
    },
  );
}
