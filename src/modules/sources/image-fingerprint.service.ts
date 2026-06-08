import sharp from "sharp";

import { ExternalServiceError } from "../shared/errors.js";

export type RemoteImageFingerprint = {
  body: Buffer;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  phash: string;
};

const HASH_SIZE = 8;
const MIN_IMAGE_WIDTH = 200;
const MIN_IMAGE_HEIGHT = 200;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const USER_AGENT = "DNL-Worker/1.0 (+https://direitonalente.com)";

function popcount(value: bigint) {
  let count = 0;
  let current = value;

  while (current > 0n) {
    count += Number(current & 1n);
    current >>= 1n;
  }

  return count;
}

function isRejectedImageUrl(url: string) {
  const lowered = url.toLowerCase();

  return (
    lowered.endsWith(".svg") ||
    lowered.includes("favicon") ||
    lowered.includes("sprite") ||
    lowered.includes("placeholder") ||
    lowered.includes("tracking") ||
    lowered.includes("pixel")
  );
}

function isExtremeAspectRatio(width: number, height: number) {
  const ratio = Math.max(width / height, height / width);
  return ratio > 4;
}

export function hammingDistance(leftHash: string, rightHash: string) {
  try {
    return popcount(BigInt(`0x${leftHash}`) ^ BigInt(`0x${rightHash}`));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export async function computePHash(buffer: Buffer): Promise<string> {
  const pixels = await sharp(buffer)
    .rotate()
    .resize(HASH_SIZE, HASH_SIZE, {
      fit: "cover",
    })
    .grayscale()
    .raw()
    .toBuffer();

  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  let hash = 0n;

  for (const pixel of pixels) {
    hash = (hash << 1n) | (pixel >= average ? 1n : 0n);
  }

  return hash.toString(16).padStart(16, "0");
}

export async function fingerprintImageBuffer(buffer: Buffer): Promise<{
  width: number | null;
  height: number | null;
  phash: string;
}> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? null;
  const height = metadata.height ?? null;

  return {
    width,
    height,
    phash: await computePHash(buffer),
  };
}

export async function downloadAndFingerprintImage(
  url: string,
  refererUrl?: string,
): Promise<RemoteImageFingerprint | null> {
  if (isRejectedImageUrl(url)) {
    return null;
  }

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...(refererUrl ? { referer: refererUrl } : {}),
    },
  });

  if (!response.ok) {
    throw new ExternalServiceError(
      `Failed to download discovered image (${response.status})`,
      "discovered_image_download_failed",
      true,
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  if (contentType.toLowerCase().includes("svg") || contentType.toLowerCase().startsWith("text/")) {
    return null;
  }

  const body = Buffer.from(await response.arrayBuffer());

  if (body.length < 10 * 1024 || body.length > MAX_IMAGE_BYTES) {
    return null;
  }

  const fingerprint = await fingerprintImageBuffer(body);

  if (
    !fingerprint.width ||
    !fingerprint.height ||
    fingerprint.width < MIN_IMAGE_WIDTH ||
    fingerprint.height < MIN_IMAGE_HEIGHT ||
    isExtremeAspectRatio(fingerprint.width, fingerprint.height)
  ) {
    return null;
  }

  return {
    body,
    contentType,
    sizeBytes: body.length,
    width: fingerprint.width,
    height: fingerprint.height,
    phash: fingerprint.phash,
  };
}
