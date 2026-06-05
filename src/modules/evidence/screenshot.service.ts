import { chromium } from "playwright";

import { ExternalServiceError } from "../shared/errors.js";

export type ScreenshotResult = {
  buffer: Buffer;
  finalUrl: string;
  capturedAt: string;
};

const PAGE_TIMEOUT_MS = 45_000;

export async function captureScreenshot(url: string): Promise<ScreenshotResult> {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 1200,
      },
    });

    await page.goto(url, {
      timeout: PAGE_TIMEOUT_MS,
      waitUntil: "networkidle",
    });

    const buffer = await page.screenshot({
      type: "png",
      fullPage: true,
    });

    return {
      buffer,
      finalUrl: page.url(),
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new ExternalServiceError(
      error instanceof Error ? error.message : "Failed to capture screenshot",
      "screenshot_capture_failed",
      true,
    );
  } finally {
    await browser.close();
  }
}
