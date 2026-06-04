import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  INTERNAL_API_SECRET: z.string().min(1, "INTERNAL_API_SECRET is required"),
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formattedErrors = parsedEnv.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  throw new Error(`Invalid environment configuration: ${JSON.stringify(formattedErrors)}`);
}

export const env = parsedEnv.data;
