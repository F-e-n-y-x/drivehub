import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ExternalLink,
  Loader2,
  Save,
  Terminal,
  TerminalSquare,
  TriangleAlert,
} from "lucide-react";
import type { AppSettings } from "@drivehub/types";
import {
  useSettings,
  useSaveSettings,
  useTerminal,
  useSetTerminal,
} from "@/hooks/queries";
import { UpdatesSection } from "@/components/settings/updates-section";
import { SystemSection } from "@/components/settings/system-section";
import { useUIStore, type ThemePreference } from "@/store/ui";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-error";
import { cn } from "@/lib/utils";

/** A label/description pair with its control right-aligned on wide screens. */
function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: React.ReactNode;
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
      {/* Right-align controls so narrow inputs share the same right edge as
          the full-width ones (no stray gap on the right). */}
      <div className="flex sm:justify-end">{children}</div>
    </div>
  );
}

/** Thin horizontal rule used to separate rows within a section. */
function RowDivider() {
  return <div className="h-px bg-border" />;
}

/**
 * One settings section: an anchor target with a consistent heading
 * (title + description) above its content. `action` renders at the top-right
 * of the heading (e.g. a "Check for updates" button).
 */
function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const sections = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "updates", label: "Updates" },
  { id: "system", label: "System" },
  { id: "developer", label: "Developer" },
] as const;

/** Sticky left-hand section navigation (large screens only). */
function SectionNav({ activeId }: { activeId: string }) {
  return (
    <nav
      aria-label="Settings sections"
      className="hidden lg:block lg:w-48 lg:shrink-0"
    >
      <ul className="sticky top-2 space-y-0.5">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={activeId === s.id ? "true" : undefined}
              className={cn(
                "block rounded-md px-3 py-1.5 text-sm transition-colors",
                activeId === s.id
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const save = useSaveSettings();
  const setTheme = useUIStore((s) => s.setTheme);
  const showLogs = useUIStore((s) => s.showLogs);
  const setShowLogs = useUIStore((s) => s.setShowLogs);
  const terminal = useTerminal();
  const setTerminal = useSetTerminal();
  const { hash } = useLocation();

  const [form, setForm] = useState<AppSettings | null>(null);
  const [activeId, setActiveId] = useState<string>(sections[0].id);

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

  // Scroll-spy: highlight the section nearest the top of the viewport. The
  // scroll container is <main> (the page itself doesn't scroll), so observe
  // against the viewport with a top-biased rootMargin.
  const ready = !isLoading && !!form;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  useEffect(() => {
    if (!ready) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ready]);

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

  const terminalData = terminal.data;

  return (
    <form onSubmit={onSubmit} className="space-y-8">
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

      <div className="flex gap-10">
        <SectionNav activeId={activeId} />

        <div className="min-w-0 flex-1 space-y-12">
          {/* 1. General / Transfers ------------------------------------- */}
          <Section
            id="general"
            title="General"
            description="Throughput limits and exclusions applied to every rclone job."
          >
            <div className="space-y-6">
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

              <RowDivider />

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

              <RowDivider />

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
                        Math.min(
                          1024,
                          Math.max(1, Number(e.target.value) || 1),
                        ),
                      )
                    }
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">MB</span>
                </div>
              </Row>

              <RowDivider />

              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Exclude patterns
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    One glob per line, applied to every job (e.g.{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      **/node_modules/**
                    </code>
                    ).
                  </p>
                </div>
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
                  className="w-full"
                />
              </div>
            </div>
          </Section>

          {/* 2. Appearance --------------------------------------------- */}
          <Section
            id="appearance"
            title="Appearance"
            description="Theme preference is stored on this device."
          >
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
          </Section>

          {/* 3. Updates ------------------------------------------------- */}
          <UpdatesSection />

          {/* 4. System -------------------------------------------------- */}
          <SystemSection />

          {/* 5. Developer ----------------------------------------------- */}
          <Section
            id="developer"
            title="Developer"
            description="In-app shell, diagnostics, and live logs for troubleshooting."
          >
            <div className="space-y-6">
              {/* Web terminal: status + warning + open, then the toggle. */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <TerminalSquare className="size-4 text-muted-foreground" />
                      Web terminal
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      A shell into the container for{" "}
                      <span className="font-mono text-foreground">
                        rclone config
                      </span>
                      , S3/SFTP/WebDAV setup, and debugging — no need to install
                      rclone elsewhere.
                    </p>
                  </div>
                  {terminalData &&
                    (terminalData.running ? (
                      <Badge variant="synced">Running</Badge>
                    ) : terminalData.enabled ? (
                      <Badge variant="pending">Starting…</Badge>
                    ) : (
                      <Badge variant="paused">Disabled</Badge>
                    ))}
                </div>

                {terminalData?.enabled ? (
                  <div className="flex items-start gap-2 rounded-lg bg-pending/10 p-3 text-xs leading-relaxed text-muted-foreground">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-pending" />
                    <span>
                      Opens a full shell into the container (as the user the app
                      runs as). On a self-hosted, unauthenticated app, keep it on
                      a trusted network only and turn it off when you're done.
                    </span>
                  </div>
                ) : terminalData && !terminalData.available ? (
                  <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    Disabled by configuration (it's a full shell on an
                    unauthenticated app). To allow it, set{" "}
                    <span className="font-mono text-foreground">
                      ENABLE_TERMINAL=true
                    </span>{" "}
                    on the container and redeploy — then toggle it on below.
                  </div>
                ) : null}

                <RowDivider />

                <Row
                  label="Enable web terminal"
                  description={
                    terminalData && !terminalData.available
                      ? "Set ENABLE_TERMINAL=true on the container to allow it."
                      : "Turning it on shows a Terminal page in the sidebar."
                  }
                >
                  <div className="flex items-center gap-3">
                    {terminalData?.running && (
                      <Link to="/terminal" className="inline-block">
                        <Button type="button" variant="outline" size="sm">
                          <ExternalLink className="size-4" />
                          Open terminal
                        </Button>
                      </Link>
                    )}
                    <Switch
                      checked={!!terminalData?.enabled}
                      disabled={
                        !terminalData?.available || setTerminal.isPending
                      }
                      onCheckedChange={(v) => setTerminal.mutate(v)}
                      aria-label="Enable web terminal"
                    />
                  </div>
                </Row>
              </div>

              <RowDivider />

              {/* Logs */}
              <Row
                label="Show Logs page"
                description="Adds a Logs page to the sidebar for full-screen log viewing."
              >
                <div className="flex items-center gap-3">
                  {showLogs && (
                    <Link
                      to="/logs"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      <Terminal className="size-4" />
                      Open Logs
                    </Link>
                  )}
                  <Switch
                    checked={showLogs}
                    onCheckedChange={setShowLogs}
                    aria-label="Show Logs page"
                  />
                </div>
              </Row>
            </div>
          </Section>
        </div>
      </div>
    </form>
  );
}
