import { PutObjectCommand } from "@aws-sdk/client-s3";

import { env } from "../../config/env.js";
import { getR2Client } from "../../config/r2.js";
import { ExternalServiceError } from "../shared/errors.js";

export async function uploadEvidenceScreenshot(
  key: string,
  buffer: Buffer,
): Promise<{ bucket: string; key: string }> {
  return uploadEvidenceFile({
    key,
    buffer,
    contentType: "image/png",
  });
}

export async function uploadEvidenceFile(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ bucket: string; key: string }> {
  const client = getR2Client();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_EVIDENCE,
        Key: params.key,
        Body: params.buffer,
        ContentType: params.contentType,
      }),
    );
  } catch (error) {
    throw new ExternalServiceError(
      error instanceof Error ? error.message : "Failed to upload screenshot to R2",
      "r2_upload_failed",
      true,
    );
  }

  return {
    bucket: env.R2_BUCKET_EVIDENCE,
    key: params.key,
  };
}
