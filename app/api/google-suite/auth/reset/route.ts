import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/apiUtils";
import { revokeGoogleWorkspaceAccess } from "@/lib/tools/google-suite/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { user, error } = await getAuthenticatedUser(await headers());

    if (error) {
      return error;
    }

    await revokeGoogleWorkspaceAccess(user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Google Suite Auth Reset] Error:", error);

    return NextResponse.json(
      { error: "Failed to reset Google Workspace access" },
      { status: 500 }
    );
  }
}
