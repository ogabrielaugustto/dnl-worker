import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  INTERNAL_API_SECRET: z.string().min(1, "INTERNAL_API_SECRET is required"),
  SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET_ASSETS: z.string().min(1, "R2_BUCKET_ASSETS is required"),
  R2_BUCKET_EVIDENCE: z.string().min(1, "R2_BUCKET_EVIDENCE is required"),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  PLATFORM_URL: z.url("PLATFORM_URL is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_FROM_EMAIL: z.email("RESEND_FROM_EMAIL must be a valid email"),
  RESEND_REPLY_TO_EMAIL: z.email().optional(),
  WORKER_ID: z.string().min(1).default("dnl-worker-local"),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  VISION_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  VISION_WEB_DETECTION_MAX_RESULTS: z.coerce.number().int().positive().default(50),
  VISION_MIN_CONFIDENCE_SCORE: z.coerce.number().min(0).max(1).default(0.9),
  VISION_PARTIAL_MATCH_MIN_CONFIDENCE_SCORE: z.coerce.number().min(0).max(1).default(0.95),
  VISION_PAGE_MATCH_MIN_CONFIDENCE_SCORE: z.coerce.number().min(0).max(1).default(0.97),
  SCREENSHOT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WAYBACK_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  WAYBACK_SUBMISSION_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  WAYBACK_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  WAYBACK_STATUS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3_000),
  WAYBACK_STATUS_MAX_ATTEMPTS: z.coerce.number().int().positive().default(6),
  WAYBACK_TIMELINE_LIMIT: z.coerce.number().int().positive().max(25).default(10),
  SITE_INTEL_MAX_PAGES: z.coerce.number().int().positive().max(25).default(10),
  SITE_INTEL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
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

const envData = parsedEnv.data;
const supabaseUrl = envData.SUPABASE_URL ?? envData.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = envData.SUPABASE_SERVICE_ROLE_KEY ?? envData.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("Invalid environment configuration: SUPABASE_URL is required");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Invalid environment configuration: SUPABASE_SERVICE_ROLE_KEY is required");
}

export const env = {
  ...envData,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
};

export type Env = typeof env;
