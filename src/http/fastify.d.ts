import "fastify";

import type { WorkerRuntime } from "../modules/jobs/worker-runtime.js";

declare module "fastify" {
  interface FastifyInstance {
    workerRuntime: WorkerRuntime;
  }
}
