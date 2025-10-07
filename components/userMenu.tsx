"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { signOut, useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { TOAST_ERROR_MESSAGES, TOAST_SUCCESS_MESSAGES } from "@/constants/errors";

export function UserMenu() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success(TOAST_SUCCESS_MESSAGES.LOGGED_OUT);
    } catch (error) {
      console.error("Logout error:", error);
      toast.error(TOAST_ERROR_MESSAGES.AUTH.FAILED_LOGOUT, {
        description: TOAST_ERROR_MESSAGES.AUTH.FAILED_LOGOUT_DESCRIPTION,
      });
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  if (!session?.user) return null;

  const userInitial = session.user.name?.charAt(0).toUpperCase() || session.user.email?.charAt(0).toUpperCase() || "U";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full hover:bg-accent/50 transition-all hover:scale-105 active:scale-95"
        >
          <div className="size-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-sm font-semibold border border-primary/20 hover:border-primary/40 transition-colors">
            {userInitial}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 overflow-hidden" align="end" sideOffset={8}>
        <div className="space-y-1">
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary/5 to-primary/10 border-b border-border/40">
            <div className="size-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-base font-semibold border-2 border-primary/20">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              {session.user.name && (
                <p className="text-sm font-semibold truncate">{session.user.name}</p>
              )}
              {session.user.email && (
                <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
              )}
            </div>
          </div>

          <Separator />

          <div className="px-2 py-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="w-full justify-start gap-3 text-sm h-10 rounded-lg hover:bg-accent"
            >
              {mounted && (
                <>
                  {theme === "dark" ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                  <span className="flex-1 text-left">
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </span>
                </>
              )}
              {!mounted && (
                <>
                  <Sun className="size-4" />
                  <span className="flex-1 text-left">Theme</span>
                </>
              )}
            </Button>
          </div>

          <Separator />

          <div className="px-2 py-1 pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start gap-3 text-sm h-10 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="size-4" />
              <span className="flex-1 text-left">Logout</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
