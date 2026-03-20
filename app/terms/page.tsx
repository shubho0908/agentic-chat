import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legalDocument";
import { LegalRouteShell } from "@/components/legal/legalRouteShell";
import { JsonLd } from "@/components/seo/jsonLd";
import {
  createBreadcrumbSchema,
  createPageMetadata,
  createWebPageSchema,
  siteConfig,
} from "@/lib/seo";

const LAST_UPDATED = "March 18, 2026";
const LAST_UPDATED_ISO = "2026-03-18T00:00:00.000Z";
const PAGE_TITLE = "Terms and Conditions";
const PAGE_DESCRIPTION = "Terms and Conditions for using Agentic Chat.";

export const metadata: Metadata = createPageMetadata({
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  path: "/terms",
  keywords: ["terms and conditions", "service terms", "AI app terms"],
  type: "article",
  modifiedTime: LAST_UPDATED_ISO,
  publishedTime: LAST_UPDATED_ISO,
  section: "Legal",
});

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageSchema({
            title: `${PAGE_TITLE} | ${siteConfig.name}`,
            description: PAGE_DESCRIPTION,
            path: "/terms",
          }),
          createBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: PAGE_TITLE, path: "/terms" },
          ]),
        ]}
      />
      <LegalRouteShell>
        <LegalDocument
          eyebrow="Legal"
          title={PAGE_TITLE}
          subtitle="These terms explain how Agentic Chat works, what you can expect from the service, and the responsibilities that come with using it."
          lastUpdated={LAST_UPDATED}
          contactEmail={siteConfig.contactEmail}
          sections={[
          {
            id: "acceptance",
            title: "1. Acceptance of Terms",
            content: (
              <>
                <p>
                  By accessing or using Agentic Chat, you agree to these Terms and to any policies
                  referenced here, including our Privacy Policy.
                </p>
              </>
            ),
          },
          {
            id: "service",
            title: "2. The Service",
            content: (
              <>
                <p>
                  Agentic Chat is an AI-powered conversation platform that may include message
                  history, attachments, conversation memory, shared links, exports, and optional
                  third-party integrations such as web search or Google Workspace tools.
                </p>
                <p>
                  Features may change over time, and we may add, remove, or adjust functionality as
                  we improve the product.
                </p>
              </>
            ),
          },
          {
            id: "accounts",
            title: "3. Accounts and Security",
            content: (
              <>
                <p>
                  You are responsible for the information you provide, for keeping your account
                  credentials secure, and for all activity that occurs under your account.
                </p>
                <p>
                  If you believe your account has been compromised, contact us immediately at{" "}
                  <Link
                    href={`mailto:${siteConfig.contactEmail}`}
                    className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                  >
                    {siteConfig.contactEmail}
                  </Link>
                  .
                </p>
              </>
            ),
          },
          {
            id: "user-content",
            title: "4. Your Content and Inputs",
            content: (
              <>
                <p>
                  You retain ownership of the content you submit to the service, including prompts,
                  files, and messages, subject to any rights you grant us to operate the product.
                </p>
                <p>
                  You represent that you have the necessary rights to submit the content and that it
                  does not violate any law or third-party rights.
                </p>
              </>
            ),
          },
          {
            id: "ai-output",
            title: "5. AI Output",
            content: (
              <>
                <p>
                  AI-generated responses may be incomplete, inaccurate, outdated, or inappropriate
                  for your use case. You are responsible for reviewing outputs before relying on
                  them, especially for professional, financial, legal, medical, or safety-related
                  decisions.
                </p>
              </>
            ),
          },
          {
            id: "third-party",
            title: "6. Third-Party Services and Keys",
            content: (
              <>
                <p>
                  Some features rely on third-party services such as OpenAI, Google Workspace,
                  storage providers, or search providers. Their own terms and policies may also
                  apply.
                </p>
                <p>
                  If you add your own API key or connect external services, you are responsible for
                  the permissions you grant and for any charges, usage limits, or data sharing that
                  those third parties impose.
                </p>
              </>
            ),
          },
          {
            id: "acceptable-use",
            title: "7. Acceptable Use",
            content: (
              <>
                <p>You agree not to misuse the service or use it to:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>{"Break the law or infringe anyone else's rights."}</li>
                  <li>Upload malicious code, spam, or harmful content.</li>
                  <li>Attempt unauthorized access, scraping, or abuse of the platform.</li>
                  <li>Interfere with service availability, integrity, or security.</li>
                </ul>
              </>
            ),
          },
          {
            id: "ip",
            title: "8. Intellectual Property",
            content: (
              <>
                <p>
                  The service, its branding, and its software are protected by intellectual property
                  laws. Except for the rights you receive under these Terms, no ownership rights are
                  transferred to you.
                </p>
              </>
            ),
          },
          {
            id: "availability",
            title: "9. Availability and Termination",
            content: (
              <>
                <p>
                  We may suspend or terminate access to the service if needed to protect the
                  platform, other users, or our systems, or if you violate these Terms.
                </p>
                <p>
                  The service is provided on an as-available basis, and we do not guarantee it will
                  always be uninterrupted or error-free.
                </p>
              </>
            ),
          },
          {
            id: "liability",
            title: "10. Disclaimer and Limitation of Liability",
            content: (
              <>
                <p>
                  To the maximum extent permitted by law, the service is provided without warranties
                  of any kind, express or implied.
                </p>
                <p>
                  To the maximum extent permitted by law, we will not be liable for indirect,
                  incidental, special, consequential, or punitive damages arising from your use of
                  the service.
                </p>
              </>
            ),
          },
          {
            id: "changes",
            title: "11. Changes to These Terms",
            content: (
              <>
                <p>
                  We may update these Terms from time to time. When we do, we will revise the date
                  above and the updated Terms will apply once posted.
                </p>
              </>
            ),
          },
          {
            id: "contact",
            title: "12. Contact",
            content: (
              <>
                <p>
                  If you have questions about these Terms, contact{" "}
                  <Link
                    href={`mailto:${siteConfig.contactEmail}`}
                    className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                  >
                    {siteConfig.contactEmail}
                  </Link>
                  .
                </p>
              </>
            ),
          },
          ]}
        />
      </LegalRouteShell>
    </>
  );
}
