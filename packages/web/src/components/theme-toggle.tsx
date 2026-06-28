import { Monitor, Moon, Sun } from "lucide-react";
import { useUIStore, type ThemePreference } from "@/store/ui";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";

const options: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <SimpleTooltip key={value} label={label}>
          <button
            onClick={() => setTheme(value)}
            aria-label={`${label} theme`}
            aria-pressed={theme === value}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              theme === value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        </SimpleTooltip>
      ))}
    </div>
  );
}
