import { useState } from "react";
import {
  Check,
  ChevronRight,
  FolderSync,
  Sparkles,
  CircleCheck,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useStatus } from "@/hooks/queries";
import { cn } from "@/lib/utils";

const steps = ["Welcome", "Connect", "Hub folder", "Done"] as const;

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center justify-center gap-2">
      {steps.map((label, i) => {
        const state =
          i < current ? "done" : i === current ? "active" : "upcoming";
        return (
          <li key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                state === "active" &&
                  "border-accent bg-accent-muted text-accent",
                state === "done" &&
                  "border-transparent bg-synced/10 text-synced",
                state === "upcoming" &&
                  "border-border text-muted-foreground",
              )}
            >
              {state === "done" ? (
                <Check className="size-3" />
              ) : (
                <span className="tabular-nums">{i + 1}</span>
              )}
              {label}
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="size-3.5 text-muted-foreground/50" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function startConnect() {
  window.location.href = "/api/auth/google/start";
}

export function FirstRunWizard() {
  const [step, setStep] = useState(0);
  const { data: status } = useStatus();
  const hubPath = status?.hubPath ?? "…";

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FolderSync className="size-4" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            DriveHub
          </span>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-lg">
          <div className="mb-8">
            <Stepper current={step} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            {step === 0 && (
              <div className="text-center">
                <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-accent-muted text-accent">
                  <Sparkles className="size-6" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Welcome to DriveHub
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Keep a local hub folder in continuous two-way sync with one or
                  more Google Drive accounts. Let's connect your first account to
                  get started.
                </p>
                <Button
                  className="mt-6"
                  variant="accent"
                  onClick={() => setStep(1)}
                >
                  Get started
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            )}

            {step === 1 && (
              <div className="text-center">
                <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-accent-muted text-accent">
                  <FolderSync className="size-6" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Connect a Google account
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  You'll be redirected to Google to grant DriveHub access to the
                  Drive folder you want to sync. You can revoke access anytime.
                </p>
                <div className="mt-6 flex flex-col items-center gap-3">
                  <Button variant="accent" onClick={startConnect}>
                    Connect with Google
                    <ChevronRight className="size-4" />
                  </Button>
                  <button
                    onClick={() => setStep(2)}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    I've already connected — continue
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="text-center">
                <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-accent-muted text-accent">
                  <FolderSync className="size-6" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Your hub folder
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  DriveHub mirrors everything to this local folder on the server.
                </p>
                <div className="mt-5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-left">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Hub path
                  </p>
                  <p className="mt-1 break-all font-mono text-sm text-foreground">
                    {hubPath}
                  </p>
                </div>
                <Button
                  className="mt-6"
                  variant="accent"
                  onClick={() => setStep(3)}
                >
                  Looks good
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="text-center">
                <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-synced/10 text-synced">
                  <CircleCheck className="size-6" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">
                  You're all set
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  DriveHub is ready. Head to the dashboard to watch your first
                  sync run in real time.
                </p>
                <Button
                  className="mt-6"
                  variant="accent"
                  onClick={() => window.location.reload()}
                >
                  Open dashboard
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {step > 0 && step < 3 && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
