import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  errorResponse,
  jsonResponse,
} from "@/lib/apiUtils";
import { HTTP_STATUS } from "@/constants/errors";
import { logger } from "@/lib/logger";
import {
  JEV_STATS_ALLOWED_EMAIL_ENV,
  isJevStatsAllowedEmail,
  loadJevStats,
  parseJevStatsQuery,
} from "@/lib/jev/stats";

export const maxDuration = 60;

/** Read-only view over persisted Jev decision records: per-checkpoint
 * outcome breakdown, fallback rate and latency percentiles over a sliding
 * day window (default 30, max 90). Records are redacted metadata only. */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(request.headers);
    if (error) return error;

    if (
      !isJevStatsAllowedEmail(
        user?.email,
        process.env[JEV_STATS_ALLOWED_EMAIL_ENV],
      )
    ) {
      return jsonResponse({ error: "Unauthorized" }, HTTP_STATUS.FORBIDDEN);
    }

    const parsed = parseJevStatsQuery(request.nextUrl.searchParams);
    if ("error" in parsed) {
      return errorResponse(parsed.error, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    return jsonResponse(await loadJevStats(parsed));
  } catch (error) {
    logger.error("[Jev Stats] Failed to load decision stats:", error);
    return errorResponse(
      "Internal server error",
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
