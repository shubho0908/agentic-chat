import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/appUrl";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "success";
  const redirectPath = status === "success"
    ? "/settings/connections?connected=true"
    : "/settings/connections?error=connection_failed";

  return NextResponse.redirect(new URL(redirectPath, appBaseUrl));
}
