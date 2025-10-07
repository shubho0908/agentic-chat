"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, ArrowLeft, LogIn, AlertCircle } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useState, useEffect, useMemo } from "react";
import { AuthModal } from "@/components/authModal";
import { useLayout } from "@/components/providers/layoutProvider";

const PARTICLES_COUNT = 20;

function BackgroundOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-1/2 -left-1/2 size-[800px] rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10 blur-3xl animate-float" />
      <div className="absolute -bottom-1/2 -right-1/2 size-[800px] rounded-full bg-gradient-to-tl from-primary/8 via-primary/3 to-transparent dark:from-primary/15 dark:via-primary/5 blur-3xl animate-float-delayed" />
      <div className="absolute top-1/4 left-1/4 size-[400px] rounded-full bg-gradient-to-r from-accent/10 to-transparent dark:from-accent/20 blur-2xl animate-pulse" />
    </div>
  );
}

function FloatingParticles() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 5 + Math.random() * 10,
      })),
    []
  );

  if (!mounted) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {particles.map((particle) => (
        <Badge
          key={particle.id}
          variant="outline"
          className="absolute size-1 rounded-full border-0 bg-primary/10 dark:bg-primary/20 animate-float p-0"
          style={{
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

function NotFoundHeader() {
  return (
    <CardHeader className="text-center space-y-6 pb-6">
      <div className="relative group mx-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/8 dark:from-primary/30 dark:to-primary/10 blur-2xl rounded-full scale-150 group-hover:scale-175 transition-transform duration-700" />
        <CardTitle className="relative text-[120px] sm:text-[160px] font-bold leading-none tracking-tighter bg-gradient-to-br from-primary via-foreground to-primary/60 bg-clip-text text-transparent animate-gradient select-none">
          404
        </CardTitle>
      </div>

      <Badge
        variant="outline"
        className="gap-1.5 px-3 py-1.5 rounded-full border-destructive/50 bg-destructive/10 w-fit mx-auto"
      >
        <AlertCircle className="size-3.5" />
        <span className="text-xs font-medium">Page Not Found</span>
      </Badge>

      <Separator className="my-4" />
    </CardHeader>
  );
}

function NotFoundContent() {
  return (
    <CardContent className="text-center space-y-4">
      <CardTitle className="text-3xl sm:text-4xl font-bold tracking-tight">
        Oops! Lost in Space
      </CardTitle>
      <CardDescription className="text-base sm:text-lg leading-relaxed max-w-md mx-auto">
        Looks like this page decided to take a vacation. The page you&apos;re looking for doesn&apos;t exist or has been moved to another dimension.
      </CardDescription>
    </CardContent>
  );
}

function NotFoundActions() {
  const router = useRouter();
  const { data: session } = useSession();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handlePrimaryAction = () => {
    if (session) {
      router.push("/");
    } else {
      setShowAuthModal(true);
    }
  };

  return (
    <>
      <CardFooter className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <Button
            onClick={() => router.back()}
            variant="outline"
            size="lg"
            className="flex-1 gap-2 rounded-xl group"
          >
            <ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </Button>
          <Button
            onClick={handlePrimaryAction}
            size="lg"
            className="flex-1 gap-2 rounded-xl group shadow-lg hover:shadow-xl"
          >
            {session ? (
              <>
                <Plus className="size-4 group-hover:scale-110 transition-transform" />
                New Chat
              </>
            ) : (
              <>
                <LogIn className="size-4 group-hover:scale-110 transition-transform" />
                Sign In
              </>
            )}
          </Button>
        </div>

        <Separator className="my-2" />

        <CardDescription className="text-xs text-muted-foreground/60">
          Lost in the digital void? Let&apos;s get you back on track.
        </CardDescription>
      </CardFooter>
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </>
  );
}

export default function NotFound() {
  const { setShowSidebar } = useLayout();

  useEffect(() => {
    setShowSidebar(false);
    return () => setShowSidebar(true);
  }, [setShowSidebar]);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-4">
      <BackgroundOrbs />
      <FloatingParticles />

      <Card className="relative z-10 max-w-2xl border-border/40 bg-card/80 dark:bg-card/95 backdrop-blur-sm shadow-xl dark:shadow-2xl">
        <NotFoundHeader />
        <NotFoundContent />
        <NotFoundActions />
      </Card>
    </div>
  );
}
