import { NextRequest } from "next/server";
import { headers } from "next/headers";
import {
  getAuthenticatedUser,
  errorResponse,
  jsonResponse,
} from "@/lib/apiUtils";
import { HTTP_STATUS } from "@/constants/errors";
import { logger } from "@/lib/logger";
import { parseJevStatsQuery, queryJevStats } from "@/lib/jev/stats";

/** Read-only view over persisted Jev decision records: per-checkpoint
 * outcome breakdown, fallback rate and latency percentiles over a sliding
 * day window (default 30, max 90). Records are redacted metadata only. */
export async function GET(request: NextRequest) {
  try {
    const { error } = await getAuthenticatedUser(await headers());
    if (error) return error;

    const parsed = parseJevStatsQuery(request.nextUrl.searchParams);
    if ("error" in parsed) {
      return errorResponse(parsed.error, undefined, HTTP_STATUS.BAD_REQUEST);
    }

    const checkpoints = await queryJevStats(parsed);
    return jsonResponse({
      window: {
        days: parsed.days,
        checkpoint: parsed.checkpoint,
        mode: parsed.mode,
        since: new Date(
          Date.now() - parsed.days * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      checkpoints,
    });
  } catch (error) {
    logger.error("[Jev Stats] Failed to load decision stats:", error);
    return errorResponse(
      "Internal server error",
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
