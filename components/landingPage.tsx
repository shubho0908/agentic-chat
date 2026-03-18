"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { InteractionShowcase } from "@/components/landing/interactionShowcase";
import { useEffect, useState } from "react";

interface LandingPageProps {
  onAuthRequired: () => void;
}

export function LandingPage({ onAuthRequired }: LandingPageProps) {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  useEffect(() => setMounted(true), []);

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
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-clip bg-background font-sans selection:bg-foreground selection:text-background">
      {/* Floating Glass Header */}
      <motion.header
        initial={prefersReducedMotion ? false : { opacity: 0, y: -18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { duration: 0.95, delay: 0.08, ease: [0.16, 1, 0.3, 1] }
        }
        className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4 sm:px-4 lg:top-6"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border-b border-border/40 bg-background/35 px-4 shadow-sm backdrop-blur-2xl dark:border-white/[0.1] dark:bg-[linear-gradient(180deg,rgba(28,30,36,0.42),rgba(12,14,18,0.28))] dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)] sm:h-16 sm:px-6">
          <div className="text-base font-medium tracking-tight dark:text-white/[0.96] sm:text-lg">Agentic Chat</div>
          <div className="flex items-center gap-3 sm:gap-6">
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4 dark:text-white/[0.62] dark:hover:text-white sm:block">
              GitHub
            </a>
            <Button
              onClick={onAuthRequired}
              className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.98] sm:px-6"
            >
              Sign In
            </Button>
          </div>
        </div>
      </motion.header>

      <main className="relative z-10 flex-1 px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-32 md:px-10 md:pt-40 lg:px-12 lg:pb-24 lg:pt-48 xl:pt-52">
        <div className="mx-auto max-w-[1400px]">
          <div className="flex flex-col items-center justify-between gap-12 sm:gap-14 lg:flex-row lg:items-center lg:gap-10 xl:gap-16">
            {/* Left: Typography */}
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="flex max-w-[42rem] flex-col items-center text-center lg:max-w-[36rem] lg:items-start lg:text-left xl:max-w-[42rem]"
            >
              <motion.h1
                variants={item}
                className="font-[family-name:var(--font-newsreader)] text-[clamp(3.35rem,13vw,5.2rem)] font-normal leading-[0.98] tracking-tight sm:text-[clamp(4.6rem,11vw,6.7rem)] lg:text-[clamp(5.4rem,7vw,7.6rem)]"
              >
                Intelligence, <br />
                <span className="italic text-muted-foreground">ready</span>
              </motion.h1>

              <motion.p
                variants={item}
                className="mt-6 max-w-[34rem] text-base leading-7 text-foreground/78 sm:mt-8 sm:text-lg sm:leading-8 md:text-[1.35rem] md:leading-9 lg:mt-10"
              >
                Exemplary AI capabilities wrapped in uncompromising privacy. Semantic memory, infinite context, and absolute control.
              </motion.p>

              <motion.div variants={item} className="mt-8 flex w-full flex-col gap-4 sm:mt-10 sm:w-auto sm:flex-row lg:mt-12">
                <Button
                  onClick={onAuthRequired}
                  className="h-12 rounded-full bg-foreground px-8 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.98] sm:h-14 sm:px-10 sm:text-base"
                >
                  Begin Experience
                </Button>
              </motion.div>
            </motion.div>

            {/* Right: Floating Agentic Interaction Showcase */}
            <div className="w-full max-w-[22rem] shrink-0 sm:max-w-[30rem] lg:w-[min(48vw,42rem)] lg:max-w-[42rem] lg:pb-6 xl:pb-8">
              <div className="relative min-h-[34rem] w-full sm:min-h-[37rem] lg:min-h-0 lg:aspect-[39/32]">
                {mounted ? (
                  <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { duration: 1.1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }
                    }
                    className="absolute inset-0"
                  >
                    <InteractionShowcase />
                  </motion.div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[1.9rem] border border-border/30 bg-muted/10 shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:rounded-[1.6rem]"
                  />
                )}
              </div>
            </div>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="mb-20 mt-20 grid gap-5 border-t border-border pt-12 sm:mb-24 sm:mt-24 sm:gap-6 sm:pt-16 md:grid-cols-2 lg:mb-32 lg:mt-32 lg:grid-cols-3 lg:gap-8 lg:pt-20"
          >
            <motion.div variants={item} className="group flex flex-col items-start rounded-3xl border border-border/40 bg-muted/20 p-6 backdrop-blur-md transition-colors hover:border-border hover:bg-muted/40 dark:bg-muted/10 sm:p-8 lg:p-10">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:mb-5 sm:text-xs">01 // Semantic Cache</div>
              <h3 className="mb-3 font-[family-name:var(--font-newsreader)] text-2xl font-medium tracking-tight sm:mb-4 sm:text-[2rem]">Instant Recall</h3>
              <p className="text-sm leading-7 text-foreground/70 sm:text-base sm:leading-relaxed">Lightning-fast precision. We index every response semantically, drawing from previous context to deliver instantaneous conclusions.</p>
            </motion.div>

            <motion.div variants={item} className="group flex flex-col items-start rounded-3xl border border-border/40 bg-muted/20 p-6 backdrop-blur-md transition-colors hover:border-border hover:bg-muted/40 dark:bg-muted/10 sm:p-8 lg:p-10">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:mb-5 sm:text-xs">02 // Deep Memory</div>
              <h3 className="mb-3 font-[family-name:var(--font-newsreader)] text-2xl font-medium tracking-tight sm:mb-4 sm:text-[2rem]">Absolute Retention</h3>
              <p className="text-sm leading-7 text-foreground/70 sm:text-base sm:leading-relaxed">A mind that never forgets. The assistant constructs a sophisticated intelligence profile across every interaction you initiate.</p>
            </motion.div>

            <motion.div variants={item} className="group flex flex-col items-start rounded-3xl border border-border/40 bg-muted/20 p-6 backdrop-blur-md transition-colors hover:border-border hover:bg-muted/40 dark:bg-muted/10 sm:col-span-2 sm:p-8 lg:col-span-1 lg:p-10">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:mb-5 sm:text-xs">03 // BYOK Architecture</div>
              <h3 className="mb-3 font-[family-name:var(--font-newsreader)] text-2xl font-medium tracking-tight sm:mb-4 sm:text-[2rem]">Sovereign Control</h3>
              <p className="text-sm leading-7 text-foreground/70 sm:text-base sm:leading-relaxed">Your key, your perimeter. Bring your own credentials to maintain absolute privacy over telemetry, requests, and billing.</p>
            </motion.div>
          </motion.div>
        </div>
      </main>

      <footer className="px-4 pb-10 pt-8 sm:px-6 sm:pb-12 md:px-10 lg:px-12">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:gap-6 sm:pt-8">
          <div className="text-sm font-medium tracking-tight">Agentic Chat</div>
          <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
