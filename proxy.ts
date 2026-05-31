import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/appUrl";

const PUBLIC_PATHS = ["/", "/privacy", "/terms"];
const SHARE_PREFIX = "/share/";

function isPublicPage(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname === "/share" ||
    pathname.startsWith(SHARE_PREFIX)
  );
}

function buildLinkHeaders(baseUrl: string): string {
  return [
    `<${baseUrl}/.well-known/agent.json>; rel="describedby"; type="application/json"`,
    `<${baseUrl}/robots.txt>; rel="robots"`,
    `<${baseUrl}/sitemap.xml>; rel="sitemap"; type="application/xml"`,
  ].join(", ");
}

function pageToMarkdown(pathname: string): string {
  const base = appBaseUrl;
  const title =
    pathname === "/"
      ? "Agentic Chat"
      : pathname === "/privacy"
        ? "Privacy Policy"
        : pathname === "/terms"
          ? "Terms of Service"
          : pathname.startsWith(SHARE_PREFIX)
            ? "Shared Conversation"
            : "Agentic Chat";

  const description =
    pathname === "/"
      ? "Multi-modal AI chat platform with intelligent query routing, semantic caching, RAG-powered document intelligence, and tool-based capabilities."
      : pathname === "/privacy"
        ? "Privacy Policy for Agentic Chat."
        : pathname === "/terms"
          ? "Terms of Service for Agentic Chat."
          : "A shared conversation on Agentic Chat.";

  return [
    `# ${title}`,
    "",
    description,
    "",
    `- [Home](${base}/)`,
    `- [Privacy Policy](${base}/privacy)`,
    `- [Terms of Service](${base}/terms)`,
    "",
    `---`,
    "",
    `Source: ${base}${pathname}`,
  ].join("\n");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isPublicPage(pathname)) {
    return NextResponse.next();
  }

  const accept = request.headers.get("accept") ?? "";

  // Markdown content negotiation
  if (accept.includes("text/markdown")) {
    const md = pageToMarkdown(pathname);
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        Link: buildLinkHeaders(appBaseUrl),
        Vary: "Accept",
      },
    });
  }

  // Add Link headers to normal HTML responses
  const response = NextResponse.next();
  response.headers.set("Link", buildLinkHeaders(appBaseUrl));
  response.headers.append("Vary", "Accept");
  return response;
}

export const config = {
  matcher: ["/", "/privacy", "/terms", "/share/:path*"],
};
