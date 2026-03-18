import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legalDocument";
import { LegalRouteShell } from "@/components/legal/legalRouteShell";

const CONTACT_EMAIL = "dev@shubhojeet.com";
const LAST_UPDATED = "March 18, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy | Agentic Chat",
  description: "How Agentic Chat collects, uses, stores, and protects information.",
};

export default function PrivacyPage() {
  return (
    <LegalRouteShell>
      <LegalDocument
        eyebrow="Legal"
        title="Privacy Policy"
        subtitle="This policy explains what data Agentic Chat collects, how it is used, and the choices you have around your information."
        lastUpdated={LAST_UPDATED}
        contactEmail={CONTACT_EMAIL}
        sections={[
          {
            id: "info-we-collect",
            title: "1. Information We Collect",
            content: (
              <>
                <p>We may collect the following categories of information:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Account information such as your name, email address, and profile details.</li>
                  <li>
                    Conversation data, prompts, messages, attachments, shared conversation links,
                    and export data.
                  </li>
                  <li>
                    Usage data such as timestamps, feature interactions, log data, device/browser
                    information, and IP-derived diagnostics.
                  </li>
                  <li>
                    Connected-service data when you enable integrations such as Google Workspace or
                    third-party search tools.
                  </li>
                  <li>
                    API keys or tokens you provide for bring-your-own-key workflows. Where possible,
                    we store sensitive credentials in encrypted form.
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: "how-we-use",
            title: "2. How We Use Information",
            content: (
              <>
                <p>We use information to:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Provide, maintain, and improve Agentic Chat.</li>
                  <li>Generate responses, handle uploads, and manage conversation history.</li>
                  <li>Support memory, search, routing, and other personalized features if enabled.</li>
                  <li>Authenticate users, enforce rate limits, and protect against abuse.</li>
                  <li>Monitor performance, debug issues, and improve reliability.</li>
                  <li>Communicate with you about product updates and support requests.</li>
                </ul>
              </>
            ),
          },
          {
            id: "sharing",
            title: "3. Sharing Your Information",
            content: (
              <>
                <p>We do not sell your personal information.</p>
                <p>We may share information with:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Service providers that help us operate the app, host data, or send emails.</li>
                  <li>Connected third-party services you authorize, such as OpenAI or Google.</li>
                  <li>Legal or regulatory authorities when required by law or to protect rights.</li>
                  <li>Successors in connection with a merger, acquisition, or similar transaction.</li>
                </ul>
              </>
            ),
          },
          {
            id: "third-party",
            title: "4. Third-Party Services",
            content: (
              <>
                <p>
                  {"When you connect third-party services, your data may also be processed under those providers' terms and privacy policies."}
                </p>
                <p>
                  Examples may include AI model providers, authentication providers, cloud storage,
                  analytics, or Google Workspace if you enable it.
                </p>
              </>
            ),
          },
          {
            id: "retention",
            title: "5. Data Retention",
            content: (
              <>
                <p>
                  We keep information for as long as needed to provide the service, comply with
                  legal obligations, resolve disputes, enforce agreements, and maintain reasonable
                  backups and logs.
                </p>
                <p>
                  You may be able to delete conversations, files, or connected account data from the
                  product. Some residual copies may remain temporarily in backups or logs.
                </p>
              </>
            ),
          },
          {
            id: "security",
            title: "6. Security",
            content: (
              <>
                <p>
                  We use technical and organizational safeguards intended to protect information
                  against unauthorized access, loss, misuse, or disclosure. No internet service can
                  be guaranteed to be completely secure.
                </p>
              </>
            ),
          },
          {
            id: "choices",
            title: "7. Your Choices",
            content: (
              <>
                <ul className="list-disc space-y-2 pl-5">
                  <li>You can contact us to request access, correction, or deletion.</li>
                  <li>You can disconnect integrations or remove API keys when no longer needed.</li>
                  <li>You can choose not to use features such as memory or public sharing.</li>
                  <li>You can stop using the service at any time.</li>
                </ul>
              </>
            ),
          },
          {
            id: "children",
            title: "8. Children's Privacy",
            content: (
              <>
                <p>
                  Agentic Chat is not intended for children under 13, and in many cases may be
                  intended only for users old enough to form a legally binding agreement. Do not use
                  the service if you are not permitted to do so under applicable law.
                </p>
              </>
            ),
          },
          {
            id: "changes",
            title: "9. Changes to This Policy",
            content: (
              <>
                <p>
                  We may update this Privacy Policy from time to time. The revised version will be
                  posted here with an updated date.
                </p>
              </>
            ),
          },
          {
            id: "contact",
            title: "10. Contact Us",
            content: (
              <>
                <p>
                  If you have questions about this Privacy Policy or your data, email{" "}
                  <Link
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                  >
                    {CONTACT_EMAIL}
                  </Link>
                  .
                </p>
              </>
            ),
          },
        ]}
      />
    </LegalRouteShell>
  );
}
