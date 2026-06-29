import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ExternalLink, Layers, Loader2, Save, Terminal } from "lucide-react";
import type { AppSettings } from "@drivehub/types";
import { useAlist, useSettings, useSaveSettings } from "@/hooks/queries";
import { StatusDot } from "@/components/status-dot";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  const showLogs = useUIStore((s) => s.showLogs);
  const setShowLogs = useUIStore((s) => s.setShowLogs);
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

          <div className="h-px bg-border" />

          <Row
            label="Speed test size"
            description="Sample size (MB) uploaded & downloaded by a remote speed test. Larger = more accurate, more bandwidth."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1024}
                value={form.speedTestSizeMb}
                onChange={(e) =>
                  update(
                    "speedTestSizeMb",
                    Math.min(1024, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">MB</span>
            </div>
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

      <AlistCard />

      <Card id="logs" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Developer</CardTitle>
          <CardDescription>
            Diagnostics and live logs for troubleshooting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row
            label="Show Logs page"
            description="Adds a Logs page to the sidebar for full-screen log viewing."
          >
            <Switch
              checked={showLogs}
              onCheckedChange={setShowLogs}
              aria-label="Show Logs page"
            />
          </Row>

          {showLogs && (
            <>
              <div className="h-px bg-border" />
              <Link
                to="/logs"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Terminal className="size-4" />
                Open Logs
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

/**
 * Built-in AList status card. AList is a managed file-gateway subprocess used
 * for backends rclone can't reach (TeraBox, Quark, Baidu, 115…). Shows a status
 * dot, the port, and an "Open AList" action when running.
 */
function AlistCard() {
  const { data: alist, isLoading } = useAlist();

  const meta = !alist
    ? { dot: "bg-paused", label: "Unknown" }
    : alist.running
      ? { dot: "bg-synced", label: "Running" }
      : alist.enabled
        ? { dot: "bg-pending", label: "Starting" }
        : { dot: "bg-paused", label: "Disabled" };

  const url = alist ? `http://${window.location.hostname}:${alist.port}` : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          Built-in AList
        </CardTitle>
        <CardDescription>
          A bundled file-gateway run as a managed subprocess for backends rclone
          can't reach directly (TeraBox, Quark, Baidu, 115…).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : (
          <Row
            label="Status"
            description={
              alist?.enabled
                ? `Admin UI on port ${alist.port}.`
                : "Not enabled."
            }
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <StatusDot
                  className={meta.dot}
                  pulse={alist?.running ?? false}
                />
                {meta.label}
                {alist?.enabled && (
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    :{alist.port}
                  </span>
                )}
              </span>
              {alist?.running && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(url, "_blank", "noopener")}
                >
                  <ExternalLink className="size-4" />
                  Open AList
                </Button>
              )}
            </div>
          </Row>
        )}

        {!isLoading && alist?.running && alist.adminPassword && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">Sign in to AList with </span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {alist.adminUser}
            </code>
            <span className="text-muted-foreground"> / </span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {alist.adminPassword}
            </code>
            <span className="text-muted-foreground">
              {" "}— set <code className="font-mono">ALIST_ADMIN_PASSWORD</code> to choose your own.
            </span>
          </div>
        )}

        {!isLoading && alist && !alist.enabled && (
          <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            To enable: set{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              ENABLE_ALIST=true
            </code>{" "}
            in your DriveHub container, map port{" "}
            <span className="tabular-nums">5244</span>, then restart.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
