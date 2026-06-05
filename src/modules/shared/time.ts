import type { DatabaseMonitoringRuleFrequency } from "./types.js";

export function addFrequency(
  frequency: DatabaseMonitoringRuleFrequency,
  currentDate: Date,
): Date {
  const nextDate = new Date(currentDate);

  switch (frequency) {
    case "hourly":
      nextDate.setUTCHours(nextDate.getUTCHours() + 1);
      break;
    case "daily":
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      break;
    case "weekly":
      nextDate.setUTCDate(nextDate.getUTCDate() + 7);
      break;
    case "monthly":
      nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
      break;
  }

  return nextDate;
}
