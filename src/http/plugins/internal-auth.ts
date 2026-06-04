import type { FastifyReply, FastifyRequest } from "fastify";

import { env } from "../../config/env.js";

export async function verifyInternalSecret(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!env.INTERNAL_API_SECRET) {
    request.log.error({ event: "internal_auth_failed" }, "Internal API secret is not configured");
    await reply.status(500).send({
      ok: false,
      message: "Internal authentication is not configured",
    });
    return;
  }

  const providedSecret = request.headers["x-internal-secret"];

  if (typeof providedSecret !== "string" || providedSecret !== env.INTERNAL_API_SECRET) {
    request.log.warn({ event: "internal_auth_failed" }, "Invalid internal authentication attempt");
    await reply.status(401).send({
      ok: false,
      message: "Unauthorized",
    });
    return;
  }
}
