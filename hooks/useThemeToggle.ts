import { STRING_ENUM } from "@/constants/stringEnums";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

export function useThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const toggleTheme = () => {
    setTheme(theme === STRING_ENUM.DARK ? "light" : "dark");
  };

  return {
    theme,
    mounted,
    toggleTheme,
  };
}
