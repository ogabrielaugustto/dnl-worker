import { existsSync, statSync } from "node:fs";

import vision from "@google-cloud/vision";

import { env } from "../../config/env.js";
import { ExternalServiceError } from "../shared/errors.js";

export type WebDetectionResult = {
  webEntities: Array<{
    entityId?: string;
    description?: string;
    score?: number | null;
  }>;
  pagesWithMatchingImages: Array<{
    url?: string;
    pageTitle?: string;
  }>;
  fullMatchingImages: Array<{
    url?: string;
  }>;
  partialMatchingImages: Array<{
    url?: string;
  }>;
  visuallySimilarImages: Array<{
    url?: string;
  }>;
  raw: unknown;
};

let visionClient: vision.ImageAnnotatorClient | null = null;

export class VisionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionConfigurationError";
  }
}

function validateVisionCredentials(): void {
  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!credentialsPath) {
    throw new VisionConfigurationError(
      "GOOGLE_APPLICATION_CREDENTIALS is not configured. Set it to the absolute path of a Google service account JSON file.",
    );
  }

  if (credentialsPath.startsWith("AIza")) {
    throw new VisionConfigurationError(
      "GOOGLE_APPLICATION_CREDENTIALS must point to a Google service account JSON file. An API key was provided instead.",
    );
  }

  if (!existsSync(credentialsPath)) {
    throw new VisionConfigurationError(
      "The file configured in GOOGLE_APPLICATION_CREDENTIALS was not found.",
    );
  }

  const credentialsStats = statSync(credentialsPath);

  if (!credentialsStats.isFile()) {
    throw new VisionConfigurationError(
      "The path configured in GOOGLE_APPLICATION_CREDENTIALS is not a file.",
    );
  }
}

function getVisionClient(): vision.ImageAnnotatorClient {
  if (!visionClient) {
    validateVisionCredentials();

    visionClient = new vision.ImageAnnotatorClient({
      projectId: env.GOOGLE_CLOUD_PROJECT_ID || undefined,
    });
  }

  return visionClient;
}

export async function detectImageOnWeb(imageUrl: string): Promise<WebDetectionResult> {
  const client = getVisionClient();

  try {
    const [result] = await client.webDetection({
      image: {
        source: {
          imageUri: imageUrl,
        },
      },
    });

    const webDetection = result.webDetection;

    return {
      webEntities:
        webDetection?.webEntities?.map((entity) => ({
          entityId: entity.entityId || undefined,
          description: entity.description || undefined,
          score: entity.score ?? null,
        })) ?? [],
      pagesWithMatchingImages:
        webDetection?.pagesWithMatchingImages?.map((page) => ({
          url: page.url || undefined,
          pageTitle: page.pageTitle || undefined,
        })) ?? [],
      fullMatchingImages:
        webDetection?.fullMatchingImages?.map((image) => ({
          url: image.url || undefined,
        })) ?? [],
      partialMatchingImages:
        webDetection?.partialMatchingImages?.map((image) => ({
          url: image.url || undefined,
        })) ?? [],
      visuallySimilarImages:
        webDetection?.visuallySimilarImages?.map((image) => ({
          url: image.url || undefined,
        })) ?? [],
      raw: result,
    };
  } catch (error) {
    throw new ExternalServiceError(
      error instanceof Error ? error.message : "Failed to execute Google Vision web detection",
      "vision_request_failed",
      true,
    );
  }
}
