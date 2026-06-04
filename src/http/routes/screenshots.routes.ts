import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { verifyInternalSecret } from "../plugins/internal-auth.js";
import { captureScreenshot } from "../../services/screenshot.service.js";

const screenshotTestBodySchema = z.object({
  url: z.url(),
});

export async function screenshotsRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    "/test",
    {
      preHandler: verifyInternalSecret,
    },
    async (request, reply) => {
      const parsedBody = screenshotTestBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        reply.status(400).send({
          ok: false,
          message: "Invalid request payload",
          issues: parsedBody.error.issues,
        });
        return;
      }

      const { url } = parsedBody.data;

      request.log.info({ event: "screenshot_test_started", url }, "Screenshot test started");

      try {
        const result = await captureScreenshot(url);

        reply
          .header("content-type", "image/png")
          .header("x-final-url", result.finalUrl)
          .header("x-captured-at", result.capturedAt);

        return result.buffer;
      } catch (error) {
        request.log.error(
          {
            event: "screenshot_test_failed",
            url,
            error,
          },
          "Screenshot test failed",
        );

        reply.status(500).send({
          ok: false,
          message: "Failed to capture screenshot",
        });
      }
    },
  );
}
