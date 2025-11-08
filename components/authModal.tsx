"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { signIn } from "@/lib/auth-client";
import { toast } from "sonner";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";

interface AuthModalProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AuthModal({ children, open, onOpenChange }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { theme } = useTheme();

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch (error) {
      console.error("Sign in error:", error);
      toast.error(TOAST_ERROR_MESSAGES.AUTH.FAILED_SIGN_IN, {
        description: TOAST_ERROR_MESSAGES.AUTH.FAILED_SIGN_IN_DESCRIPTION,
      });
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent 
        className="sm:max-w-md border-0 p-0 gap-0 overflow-hidden bg-transparent shadow-none"
        showCloseButton={false}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ 
            duration: 0.2,
            ease: [0.16, 1, 0.3, 1]
          }}
          className="relative bg-background border border-border rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_2px_4px_rgba(0,0,0,0.05),0_12px_24px_rgba(0,0,0,0.05)] overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          
          <div className="p-8">
            <div className="flex flex-col items-center text-center space-y-6">
                <Image
                  src={theme === "dark" ? "/dark.png" : "/light.png"}
                  alt="Agentic Chat"
                  width={80}
                  height={80}
                  className="object-contain"
                  priority
                />

              <div className="space-y-2">
                <DialogTitle className="text-2xl font-semibold tracking-tight">
                  Sign in to continue
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Access your conversations and history
                </p>
              </div>

              <Button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                size="lg"
                className="w-full h-11 rounded-xl text-[15px] font-medium bg-foreground hover:bg-foreground/90 text-background border-0 shadow-sm hover:shadow-md transition-all duration-200"
                variant="default"
              >
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Signing in...</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2.5"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      <span>Continue with Google</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>

              <p className="text-xs text-muted-foreground/70 pt-2">
                By continuing, you agree to our Terms and Privacy Policy
              </p>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
