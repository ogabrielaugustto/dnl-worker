import { chromium } from "playwright";

import { ExternalServiceError } from "../shared/errors.js";

export type ScreenshotResult = {
  buffer: Buffer;
  finalUrl: string;
  capturedAt: string;
};

const PAGE_TIMEOUT_MS = 45_000;
const PRIMARY_NAVIGATION_TIMEOUT_MS = 20_000;
const LOAD_STATE_TIMEOUT_MS = 10_000;
const STABILIZATION_DELAY_MS = 1_500;

function isNavigationTimeout(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("page.goto: Timeout") ||
      error.message.toLowerCase().includes("navigation timeout"))
  );
}

async function waitForBestEffortPageStability(page: Awaited<ReturnType<typeof chromium.launch>> extends never ? never : import("playwright").Page) {
  try {
    await page.waitForLoadState("load", {
      timeout: LOAD_STATE_TIMEOUT_MS,
    });
  } catch {
    // Some sites keep loading ads/trackers forever. We still want the current visual state.
  }

  await page.waitForTimeout(STABILIZATION_DELAY_MS);
}

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

    await page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
    await page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    try {
      await page.goto(url, {
        timeout: PRIMARY_NAVIGATION_TIMEOUT_MS,
        waitUntil: "domcontentloaded",
      });
    } catch (error) {
      if (!isNavigationTimeout(error)) {
        throw error;
      }
    }

    await waitForBestEffortPageStability(page);

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
