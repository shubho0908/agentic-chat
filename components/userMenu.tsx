"use client";

import { useState, type RefObject } from "react";
import { LogOut, Moon, Settings2, SlidersHorizontal, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOut, useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { TOAST_ERROR_MESSAGES } from "@/constants/errors";
import { TOAST_SUCCESS_MESSAGES } from "@/constants/toasts";
import { clearUserStorage } from "@/lib/storage";
import { useThemeToggle } from "@/hooks/useThemeToggle";

interface UserMenuProps {
  byokTriggerRef?: RefObject<HTMLButtonElement | null>;
}

export function UserMenu({ byokTriggerRef }: UserMenuProps) {
  const { data: session } = useSession();
  const { theme, mounted, toggleTheme } = useThemeToggle();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    try {
      clearUserStorage();
      await signOut();
      router.push("/");
      toast.success(TOAST_SUCCESS_MESSAGES.LOGGED_OUT);
    } catch (error) {
      console.error("Logout error:", error);
      toast.error(TOAST_ERROR_MESSAGES.AUTH.FAILED_LOGOUT, {
        description: TOAST_ERROR_MESSAGES.AUTH.FAILED_LOGOUT_DESCRIPTION,
      });
    }
  };

  if (!session?.user) return null;

  const userInitial = session.user.name?.charAt(0).toUpperCase() || session.user.email?.charAt(0).toUpperCase() || "U";
  const openApiSettings = () => {
    setOpen(false);
    window.setTimeout(() => byokTriggerRef?.current?.click(), 0);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full transition-all duration-200 ease-out hover:scale-105 hover:bg-accent/50 active:scale-95"
        >
          <Avatar className="size-8 border border-primary/20 hover:border-primary/40 transition-colors">
            <AvatarImage src={session.user.image || undefined} alt={session.user.name || "User"} />
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-sm font-semibold">
              {userInitial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 overflow-hidden" align="end" sideOffset={8}>
        <div className="space-y-0">
          <div className="flex items-center gap-3 border-b border-border/40 bg-gradient-to-r from-primary/5 to-primary/10 p-3.5">
            <Avatar className="size-11 border-2 border-primary/20">
              <AvatarImage src={session.user.image || undefined} alt={session.user.name || "User"} />
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-base font-semibold">
                {userInitial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              {session.user.name && (
                <p className="truncate text-sm font-semibold">{session.user.name}</p>
              )}
              {session.user.email && (
                <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
              )}
            </div>
          </div>

          <div className="px-2 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={openApiSettings}
              className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-sm hover:bg-accent"
            >
              <SlidersHorizontal className="size-4" />
              <span className="flex-1 text-left">API Settings</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                router.push("/settings/google-workspace");
              }}
              className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-sm hover:bg-accent"
            >
              <Settings2 className="size-4" />
              <span className="flex-1 text-left">Google Workspace</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                toggleTheme();
              }}
              className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-sm hover:bg-accent"
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

          <div className="px-2 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                void handleLogout();
              }}
              className="h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-sm transition-colors hover:bg-destructive/10 hover:text-destructive"
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
