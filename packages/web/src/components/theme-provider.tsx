import { useEffect } from "react";
import { resolveTheme, useUIStore } from "@/store/ui";

/** Applies the persisted theme to <html> and reacts to system changes. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const apply = () => {
      const effective = resolveTheme(theme);
      document.documentElement.classList.toggle("dark", effective === "dark");
    };
    apply();

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  return <>{children}</>;
}
