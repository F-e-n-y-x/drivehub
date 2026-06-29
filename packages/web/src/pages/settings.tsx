import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import type { AppSettings } from "@drivehub/types";
import { useSettings, useSaveSettings } from "@/hooks/queries";
import { UpdatesSection } from "@/components/settings/updates-section";
import { SystemSection } from "@/components/settings/system-section";
import { useUIStore, type ThemePreference } from "@/store/ui";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-error";
import { cn } from "@/lib/utils";

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_280px] sm:items-start sm:gap-6">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function SettingsPage() {
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const save = useSaveSettings();
  const setTheme = useUIStore((s) => s.setTheme);
  const { hash } = useLocation();

  const [form, setForm] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  // Deep-link to a section, e.g. /settings#updates from the sidebar widget.
  useEffect(() => {
    if (!hash || isLoading) return;
    const id = hash.replace(/^#/, "");
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, isLoading]);

  if (isLoading || !form) {
    return (
      <div className="space-y-7">
        <PageHeader title="Settings" />
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : (
          <Skeleton className="h-96 rounded-xl" />
        )}
      </div>
    );
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form) save.mutate(form);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      <PageHeader
        title="Settings"
        description="Tune how the sync engine behaves."
        actions={
          <Button type="submit" variant="accent" disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save changes
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Transfers</CardTitle>
          <CardDescription>
            Throughput limits applied to every rclone job.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Row
            label="Concurrency"
            description="Maximum number of file transfers running in parallel."
          >
            <Input
              type="number"
              min={1}
              max={64}
              value={form.concurrency}
              onChange={(e) =>
                update(
                  "concurrency",
                  Math.min(64, Math.max(1, Number(e.target.value) || 1)),
                )
              }
              className="w-28"
            />
          </Row>

          <div className="h-px bg-border" />

          <Row
            label="Bandwidth limit"
            description="rclone --bwlimit syntax, e.g. 10M for 10 MiB/s. Leave empty for unlimited."
          >
            <Input
              value={form.bandwidthLimit}
              onChange={(e) => update("bandwidthLimit", e.target.value)}
              placeholder="unlimited"
              className="w-40 font-mono"
            />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exclude patterns</CardTitle>
          <CardDescription>
            One glob per line, applied to every job (e.g.{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              **/node_modules/**
            </code>
            ).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.excludePatterns.join("\n")}
            onChange={(e) =>
              update(
                "excludePatterns",
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder={"*.tmp\n**/.DS_Store\n**/node_modules/**"}
            spellCheck={false}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Theme preference is stored on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Theme">
            <div className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-0.5">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    update("theme", opt.value);
                    setTheme(opt.value);
                  }}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                    form.theme === opt.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Row>
        </CardContent>
      </Card>

      <UpdatesSection />

      <SystemSection />
    </form>
  );
}
