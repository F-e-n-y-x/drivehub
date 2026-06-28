import { useEffect, useState } from "react";
import { Loader2, Save, ShieldAlert } from "lucide-react";
import type { AppSettings } from "@drivehub/types";
import { useSettings, useStatus, useSaveSettings } from "@/hooks/queries";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-error";
import { cn } from "@/lib/utils";

function Field({
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
  const { data: status } = useStatus();
  const save = useSaveSettings();
  const setTheme = useUIStore((s) => s.setTheme);

  const [form, setForm] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

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

  const pollSeconds = Math.round(form.pollIntervalMs / 1000);

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
          <CardTitle>Sync engine</CardTitle>
          <CardDescription>
            Core polling and throughput behavior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Field
            label="Poll interval"
            description="How often DriveHub checks each account for remote changes."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={pollSeconds}
                onChange={(e) =>
                  update(
                    "pollIntervalMs",
                    Math.max(1, Number(e.target.value) || 1) * 1000,
                  )
                }
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </Field>

          <div className="h-px bg-border" />

          <Field
            label="Concurrency"
            description="Maximum number of file transfers running in parallel."
          >
            <Input
              type="number"
              min={1}
              max={32}
              value={form.concurrency}
              onChange={(e) =>
                update(
                  "concurrency",
                  Math.min(32, Math.max(1, Number(e.target.value) || 1)),
                )
              }
              className="w-28"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Safety</CardTitle>
          <CardDescription>
            Controls that affect whether deletions propagate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Field
            label="Delete propagation"
            description="When on, deleting a file on one side deletes it everywhere. When off, deletions are never mirrored — safer, but the hub may keep files you removed remotely."
          >
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Switch
                checked={form.deletePropagation}
                onCheckedChange={(v) => update("deletePropagation", v)}
              />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {form.deletePropagation ? "Enabled" : "Disabled"}
                </p>
                {form.deletePropagation && (
                  <p className="flex items-start gap-1.5 text-xs text-pending">
                    <ShieldAlert className="mt-px size-3.5 shrink-0" />
                    Deletions will be mirrored across all synced locations.
                  </p>
                )}
              </div>
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ignore patterns</CardTitle>
          <CardDescription>
            One glob per line. Matching paths are never synced (e.g.{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              **/node_modules/**
            </code>
            ).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.ignorePatterns.join("\n")}
            onChange={(e) =>
              update(
                "ignorePatterns",
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
          <Field label="Theme">
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
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hub folder</CardTitle>
          <CardDescription>
            The local directory DriveHub mirrors everything into (read-only).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            readOnly
            value={status?.hubPath ?? "Loading…"}
            className="cursor-default font-mono text-xs text-muted-foreground"
          />
        </CardContent>
      </Card>
    </form>
  );
}
