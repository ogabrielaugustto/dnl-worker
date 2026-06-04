import vision from "@google-cloud/vision";

import { env } from "../config/env.js";

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

function getVisionClient(): vision.ImageAnnotatorClient {
  if (!visionClient) {
    visionClient = new vision.ImageAnnotatorClient({
      projectId: env.GOOGLE_CLOUD_PROJECT_ID || undefined,
    });
  }

  return visionClient;
}

export async function detectImageOnWeb(imageUrl: string): Promise<WebDetectionResult> {
  const client = getVisionClient();

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
}
