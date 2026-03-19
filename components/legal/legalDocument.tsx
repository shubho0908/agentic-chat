import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

interface LegalDocumentProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  contactEmail: string;
  sections: LegalSection[];
}

export function LegalDocument({
  eyebrow,
  title,
  subtitle,
  lastUpdated,
  contactEmail,
  sections,
}: LegalDocumentProps) {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>

          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/55">
            {eyebrow}
          </p>
        </div>

        <section className="pt-8 sm:pt-10">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/55">
            Agentic Chat
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
            {subtitle}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground/65">
            <span>Last updated: {lastUpdated}</span>
            <span aria-hidden="true" className="text-muted-foreground/30">
              /
            </span>
            <Link
              href={`mailto:${contactEmail}`}
              className="font-medium text-foreground/75 transition-colors hover:text-foreground"
            >
              {contactEmail}
            </Link>
          </div>
        </section>

        <div className="mt-10 space-y-0">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className={`${index === 0 ? "border-t" : ""} border-b border-border/60 py-6 sm:py-7`}
            >
              <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                {section.title}
              </h2>
              <div className="mt-3 space-y-4 text-sm leading-7 text-muted-foreground sm:text-[15px]">
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
