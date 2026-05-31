"use client";

import { useEffect } from "react";
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
import { RotateCcw, Home, AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App Error Boundary]", error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-4">
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-1/2 -left-1/2 size-[800px] rounded-full bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 size-[800px] rounded-full bg-gradient-to-tl from-destructive/8 via-destructive/3 to-transparent blur-3xl" />
      </div>

      <Card className="relative z-10 w-full max-w-lg border-border/40 bg-card/80 dark:bg-card/95 backdrop-blur-sm shadow-xl">
        <CardHeader className="text-center space-y-4 pb-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-8 text-destructive" />
          </div>
          <Badge
            variant="outline"
            className="gap-1.5 px-3 py-1.5 rounded-full border-destructive/50 bg-destructive/10 w-fit mx-auto"
          >
            <span className="text-xs font-medium">Something went wrong</span>
          </Badge>
        </CardHeader>

        <Separator />

        <CardContent className="text-center space-y-3 pt-6">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Unexpected Error
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed max-w-sm mx-auto">
            An error occurred while rendering this page. You can try again or return home.
          </CardDescription>
          {error.digest && (
            <p className="text-xs text-muted-foreground/60 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button
            onClick={reset}
            variant="outline"
            size="lg"
            className="w-full sm:flex-1 gap-2 rounded-xl"
          >
            <RotateCcw className="size-4" />
            Try Again
          </Button>
          <Button
            onClick={() => (window.location.href = "/")}
            size="lg"
            className="w-full sm:flex-1 gap-2 rounded-xl"
          >
            <Home className="size-4" />
            Go Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
