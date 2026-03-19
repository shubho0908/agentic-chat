"use client";

import dynamic from "next/dynamic";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LegalLinks } from "@/components/legalLinks";
import { homepageFaqs } from "@/lib/seo";

interface LandingPageProps {
  onAuthRequired: () => void;
}

const InteractionShowcase = dynamic(
  () =>
    import("@/components/landing/interaction-showcase/interactionShowcase").then(
      (module) => module.InteractionShowcase,
    ),
  {
    ssr: false,
    loading: () => <LandingShowcaseFallback />,
  },
);

function LandingShowcaseFallback() {
  return (
    <div
      aria-hidden="true"
      className="aspect-[10/19] w-full rounded-[1.9rem] border border-border/30 bg-muted/10 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:aspect-[4/5] lg:aspect-[39/32] lg:rounded-[1.6rem]"
    />
  );
}

export function LandingPage({ onAuthRequired }: LandingPageProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const transitionOption = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 1.2, ease: [0.16, 1, 0.3, 1] as const };

  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const item: Variants = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: transitionOption },
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="relative flex min-h-[100dvh] flex-col overflow-x-clip bg-background font-sans selection:bg-foreground selection:text-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[42rem] bg-[radial-gradient(circle_at_top,rgba(120,140,180,0.18),transparent_58%)] dark:bg-[radial-gradient(circle_at_top,rgba(140,158,191,0.16),transparent_52%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[16rem] z-0 h-[28rem] bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.03),transparent)] dark:bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.03),transparent)]"
        />
        <m.header
          initial={prefersReducedMotion ? false : { opacity: 0, y: -18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.95, delay: 0.08, ease: [0.16, 1, 0.3, 1] }
          }
          className="fixed inset-x-0 top-2.5 z-50 px-2.5 sm:top-4 sm:px-4 lg:top-6"
        >
          <div className="mx-auto flex h-12 max-w-6xl items-center justify-between rounded-full border-b border-border/40 bg-background/45 px-3.5 shadow-sm backdrop-blur-2xl dark:border-white/[0.1] dark:bg-[linear-gradient(180deg,rgba(28,30,36,0.42),rgba(12,14,18,0.28))] dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)] sm:h-14 sm:px-5 md:h-16 md:px-6">
            <div className="text-sm font-medium tracking-tight dark:text-white/[0.96] sm:text-base md:text-lg">Agentic Chat</div>
            <div className="flex items-center gap-2.5 sm:gap-4 md:gap-6">
              <nav aria-label="Primary" className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
                <a href="#capabilities" className="transition-colors hover:text-foreground dark:hover:text-white">
                  Capabilities
                </a>
                <a href="#workflow" className="transition-colors hover:text-foreground dark:hover:text-white">
                  Workflow
                </a>
                <a href="#faq" className="transition-colors hover:text-foreground dark:hover:text-white">
                  FAQ
                </a>
              </nav>
              <a href="https://github.com/shubho0908/agentic-chat" target="_blank" rel="noreferrer" className="hidden text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground dark:text-white/[0.62] dark:hover:text-white sm:block">
                GitHub
              </a>
              <Button
                onClick={onAuthRequired}
                className="h-[2.125rem] rounded-full bg-foreground px-4 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.98] sm:h-9 sm:px-5 md:px-6"
              >
                Sign In
              </Button>
            </div>
          </div>
        </m.header>

        <main className="relative z-10 flex-1 px-4 pb-[clamp(3.5rem,8vw,6rem)] pt-[7.25rem] sm:px-6 sm:pt-[clamp(7.5rem,13vw,13rem)] md:px-10 lg:px-12">
          <div className="mx-auto max-w-[1400px]">
            <div className="flex flex-col items-center justify-between gap-[clamp(2.75rem,6vw,5rem)] lg:flex-row lg:items-center lg:gap-10 xl:gap-16">
              <m.div
                variants={container}
                initial="hidden"
                animate="show"
                className="flex max-w-[42rem] flex-col items-center text-center lg:max-w-[36rem] lg:items-start lg:text-left xl:max-w-[42rem]"
              >
                <m.h1
                  variants={item}
                  className="max-w-[12ch] text-balance font-[family-name:var(--font-newsreader)] text-[clamp(2.9rem,12vw,7.4rem)] font-normal leading-[0.94] tracking-tight"
                >
                  Intelligence, <br />
                  <span className="italic text-muted-foreground">with context</span>
                </m.h1>

                <m.p
                  variants={item}
                  className="mt-5 max-w-[34rem] text-balance text-[clamp(1rem,2.4vw,1.32rem)] leading-[clamp(1.75rem,3vw,2.15rem)] text-foreground/78 sm:mt-7 lg:mt-8"
                >
                  Agentic Chat is an AI chat app for web search, document analysis, conversation memory, and Google Workspace workflows. Bring in sources, continue with full context, and use your own API key when you want billing and access to stay on your side.
                </m.p>

                <m.div variants={item} className="mt-7 flex w-full flex-col gap-3.5 sm:mt-9 sm:w-auto sm:flex-row lg:mt-10">
                  <Button
                    onClick={onAuthRequired}
                    className="h-12 w-full rounded-full bg-foreground px-8 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.98] sm:h-14 sm:w-auto sm:px-10 sm:text-base"
                  >
                    Start chatting
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-12 w-full rounded-full border-border/60 bg-background/70 px-8 text-sm font-medium backdrop-blur-sm sm:h-14 sm:w-auto sm:px-10 sm:text-base"
                  >
                    <a href="#capabilities">Explore features</a>
                  </Button>
                </m.div>
              </m.div>

              <div className="w-full max-w-[clamp(16.75rem,78vw,22rem)] shrink-0 sm:max-w-[28rem] md:max-w-[30rem] lg:w-[min(48vw,42rem)] lg:max-w-[42rem]">
                <div className="relative flex w-full justify-center">
                  <m.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { duration: 1.1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }
                    }
                    className="w-full"
                  >
                    <InteractionShowcase />
                  </m.div>
                </div>
              </div>
            </div>

            <m.section
              id="capabilities"
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              className="mt-[clamp(4rem,9vw,8rem)] grid gap-4 border-t border-border/80 pt-[clamp(2.75rem,6vw,5rem)] sm:gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8"
            >
              <m.div variants={item} className="flex min-h-full flex-col items-start rounded-[1.75rem] border border-border/40 bg-muted/20 p-5 backdrop-blur-md transition-colors hover:border-border hover:bg-muted/40 dark:bg-muted/10 sm:p-7 lg:p-10">
                <div className="mb-4 inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.14em] sm:mb-5 sm:text-xs">
                  <span className="text-muted-foreground">Fast recall</span>
                </div>
                <h3 className="mb-3 text-balance font-[family-name:var(--font-newsreader)] text-[clamp(1.7rem,5vw,2rem)] font-medium tracking-tight sm:mb-4">Less repeat work</h3>
                <p className="text-[0.95rem] leading-7 text-foreground/70 sm:text-base sm:leading-relaxed">When a question comes back around, it can skip the obvious rework and start from what already matters.</p>
              </m.div>

              <m.div variants={item} className="flex min-h-full flex-col items-start rounded-[1.75rem] border border-border/40 bg-muted/20 p-5 backdrop-blur-md transition-colors hover:border-border hover:bg-muted/40 dark:bg-muted/10 sm:p-7 lg:p-10">
                <div className="mb-4 inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.14em] sm:mb-5 sm:text-xs">
                  <span className="text-muted-foreground">Thread continuity</span>
                </div>
                <h3 className="mb-3 text-balance font-[family-name:var(--font-newsreader)] text-[clamp(1.7rem,5vw,2rem)] font-medium tracking-tight sm:mb-4">Picks up where you left off</h3>
                <p className="text-[0.95rem] leading-7 text-foreground/70 sm:text-base sm:leading-relaxed">Important context stays in reach, so follow-ups feel like one conversation instead of a reset.</p>
              </m.div>

              <m.div variants={item} className="flex min-h-full flex-col items-start rounded-[1.75rem] border border-border/40 bg-muted/20 p-5 backdrop-blur-md transition-colors hover:border-border hover:bg-muted/40 dark:bg-muted/10 sm:col-span-2 sm:p-7 lg:col-span-1 lg:p-10">
                <div className="mb-4 inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.14em] sm:mb-5 sm:text-xs">
                  <span className="text-muted-foreground">Personal key</span>
                </div>
                <h3 className="mb-3 text-balance font-[family-name:var(--font-newsreader)] text-[clamp(1.7rem,5vw,2rem)] font-medium tracking-tight sm:mb-4">Keep your own key</h3>
                <p className="text-[0.95rem] leading-7 text-foreground/70 sm:text-base sm:leading-relaxed">Use your own API key if you want access and billing to stay under your control.</p>
              </m.div>
            </m.section>

            <m.section
              id="workflow"
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              className="mt-[clamp(4rem,8vw,7rem)] rounded-[2rem] border border-border/70 bg-muted/10 px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12"
            >
              <m.div variants={item} className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  AI workflow
                </p>
                <h2 className="mt-3 font-[family-name:var(--font-newsreader)] text-[clamp(2.1rem,5vw,3.4rem)] leading-[1.02] tracking-tight">
                  One place for research, synthesis, and the next step
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground/72 sm:text-base">
                  Start with a question, add the web and your files, then continue the thread without
                  rebuilding context. Agentic Chat is designed for deep research, document-grounded
                  answers, and follow-up work that depends on what happened earlier in the session.
                </p>
              </m.div>

              <div className="mt-8 grid gap-4 md:grid-cols-3 lg:gap-6">
                <m.article variants={item} className="rounded-[1.6rem] border border-border/50 bg-background/70 p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    01
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight">Gather context</h3>
                  <p className="mt-3 text-sm leading-7 text-foreground/70">
                    Search the web, attach documents, and bring the relevant material into one AI chat
                    workspace.
                  </p>
                </m.article>

                <m.article variants={item} className="rounded-[1.6rem] border border-border/50 bg-background/70 p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    02
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight">Keep memory alive</h3>
                  <p className="mt-3 text-sm leading-7 text-foreground/70">
                    Preserve important details across the thread so later prompts can build on the same
                    facts instead of starting over.
                  </p>
                </m.article>

                <m.article variants={item} className="rounded-[1.6rem] border border-border/50 bg-background/70 p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    03
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight">Work across tools</h3>
                  <p className="mt-3 text-sm leading-7 text-foreground/70">
                    Extend the conversation into Gmail, Drive, Calendar, Docs, Sheets, and Slides when
                    a task calls for connected workspace actions.
                  </p>
                </m.article>
              </div>
            </m.section>

            <m.section
              id="faq"
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              className="mt-[clamp(4rem,8vw,7rem)] border-t border-border/80 pt-[clamp(2.75rem,6vw,4.5rem)]"
            >
              <m.div variants={item} className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Frequently asked questions
                </p>
                <h2 className="mt-3 font-[family-name:var(--font-newsreader)] text-[clamp(2rem,5vw,3rem)] leading-[1.04] tracking-tight">
                  Answers for teams evaluating Agentic Chat
                </h2>
              </m.div>

              <div className="mt-8 grid gap-4 lg:grid-cols-2">
                {homepageFaqs.map((faq) => (
                  <m.article
                    key={faq.question}
                    variants={item}
                    className="rounded-[1.5rem] border border-border/50 bg-muted/10 p-5 sm:p-6"
                  >
                    <h3 className="text-lg font-semibold tracking-tight">{faq.question}</h3>
                    <p className="mt-3 text-sm leading-7 text-foreground/70 sm:text-[15px]">
                      {faq.answer}
                    </p>
                  </m.article>
                ))}
              </div>
            </m.section>

            <m.section
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              className="mt-[clamp(4rem,8vw,7rem)]"
            >
              <m.div
                variants={item}
                className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-border/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-5 py-7 sm:px-8 sm:py-9 lg:flex-row lg:items-center lg:px-10"
              >
                <div className="max-w-2xl">
                  <h2 className="font-[family-name:var(--font-newsreader)] text-[clamp(2rem,4.5vw,2.9rem)] leading-[1.05] tracking-tight">
                    Start with the landing page, continue with the product
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-foreground/72 sm:text-base">
                    Read the product details, then sign in when you&apos;re ready to use the full AI chat
                    experience.
                  </p>
                </div>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <Button
                    onClick={onAuthRequired}
                    className="h-11 rounded-full bg-foreground px-6 text-sm font-medium text-background sm:h-12"
                  >
                    Sign in to continue
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="h-11 rounded-full px-4 text-sm font-medium text-foreground/75 sm:h-12"
                  >
                    <Link href="/privacy">Read privacy policy</Link>
                  </Button>
                </div>
              </m.div>
            </m.section>
          </div>
        </main>

        <footer className="px-4 pb-8 pt-6 sm:px-6 sm:pb-12 sm:pt-8 md:px-10 lg:px-12">
          <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 border-t border-border/80 pt-5 sm:flex-row sm:gap-6 sm:pt-8">
            <div className="text-sm font-medium tracking-tight">Agentic Chat</div>
            <div className="flex flex-col items-center gap-2 text-center sm:items-end sm:text-right">
              <div className="text-xs text-muted-foreground">© {currentYear} All rights reserved.</div>
              <LegalLinks className="text-[11px]" />
            </div>
          </div>
        </footer>
      </div>
    </LazyMotion>
  );
}
