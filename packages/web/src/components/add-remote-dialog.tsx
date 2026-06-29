import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { RemoteTypeInfo } from "@drivehub/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/field";
import { RemoteTypeFields } from "@/components/remote-type-fields";
import { remoteIcon } from "@/lib/remotes";
import { useRemoteCatalog, useRemoteMutations, useRemotes } from "@/hooks/queries";
import { toast } from "@/components/ui/toast";

type Step = "pick" | "form";

// How long to wait for the OAuth tab to complete before giving up. The flow
// is: open Google in a new tab → user authorizes → backend creates the remote
// and emits a `remote` SSE event → our remotes query updates → we detect the
// new id here.
const CONNECT_TIMEOUT_MS = 3 * 60_000;

export function AddRemoteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: catalog, isLoading } = useRemoteCatalog();
  const { create, createOAuth } = useRemoteMutations();
  const { data: remotes } = useRemotes();

  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<RemoteTypeInfo | null>(null);
  const [label, setLabel] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  // For Google Drive: reveal the "paste an rclone token" path alongside the
  // redirect button (needed when accessing DriveHub via an IP address).
  const [driveTokenMode, setDriveTokenMode] = useState(false);

  // Live OAuth-redirect connection status. `idle` = normal form; `connecting`
  // = waiting for the Google tab to finish; `connected` = a new remote
  // appeared and we're about to close.
  type ConnectPhase = "idle" | "connecting" | "connected";
  const [connectPhase, setConnectPhase] = useState<ConnectPhase>("idle");
  const [connectHint, setConnectHint] = useState<string | null>(null);
  // Remote ids captured the moment the user clicked Connect, so we can detect
  // the *new* one that the OAuth flow creates.
  const knownIdsRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConnectTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const reset = () => {
    clearConnectTimeout();
    setStep("pick");
    setSelected(null);
    setLabel("");
    setParams({});
    setToken("");
    setDriveTokenMode(false);
    setConnectPhase("idle");
    setConnectHint(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const pick = (info: RemoteTypeInfo) => {
    setSelected(info);
    setLabel(info.label);
    setParams({});
    setToken("");
    setDriveTokenMode(false);
    setStep("form");
  };

  const missingRequired = useMemo(() => {
    if (!selected || selected.oauth) return false;
    return selected.fields.some(
      (f) => f.required && !(params[f.key] ?? "").trim(),
    );
  }, [selected, params]);

  const isGoogle = selected?.type === "drive";
  const isOtherOAuth =
    selected?.oauth && (selected.type === "dropbox" || selected.type === "onedrive");
  // Drive uses redirect by default, but can paste a token in "advanced" mode.
  const isGoogleRedirect = isGoogle && !driveTokenMode;
  // Any path that submits an rclone token JSON.
  const isTokenPaste = isOtherOAuth || (isGoogle && driveTokenMode);

  // Detect a freshly-connected OAuth remote: while we're waiting on the Google
  // tab, watch the remotes list for an id we hadn't seen at click time.
  useEffect(() => {
    if (connectPhase !== "connecting" || !remotes) return;
    const fresh = remotes.find((r) => !knownIdsRef.current.has(r.id));
    if (!fresh) return;
    clearConnectTimeout();
    setConnectPhase("connected");
    toast.success("Google Drive connected", { description: fresh.label });
    const t = setTimeout(() => close(false), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectPhase, remotes]);

  // Clean up any pending timeout if the dialog unmounts.
  useEffect(() => () => clearConnectTimeout(), []);

  const startRedirectConnect = (info: RemoteTypeInfo) => {
    knownIdsRef.current = new Set((remotes ?? []).map((r) => r.id));
    setConnectHint(null);
    setConnectPhase("connecting");
    // Open the provider sign-in in a new tab so the user keeps DriveHub open
    // here and watches the live status.
    window.open(
      `/api/oauth/google/start?label=${encodeURIComponent(
        label || info.label,
      )}`,
      "_blank",
      "noopener",
    );
    clearConnectTimeout();
    timeoutRef.current = setTimeout(() => {
      setConnectPhase("idle");
      setConnectHint(
        "Didn't detect a connection — make sure you finished sign-in in the other tab.",
      );
    }, CONNECT_TIMEOUT_MS);
  };

  const cancelConnect = () => {
    clearConnectTimeout();
    setConnectPhase("idle");
    setConnectHint(null);
  };

  const submit = () => {
    if (!selected) return;
    if (isGoogleRedirect) {
      startRedirectConnect(selected);
      return;
    }
    if (isTokenPaste) {
      createOAuth.mutate(
        {
          type: selected.type as "drive" | "dropbox" | "onedrive",
          label: label || selected.label,
          token: token.trim(),
        },
        { onSuccess: () => close(false) },
      );
      return;
    }
    create.mutate(
      { type: selected.type, label: label || selected.label, params },
      { onSuccess: () => close(false) },
    );
  };

  const busy = create.isPending || createOAuth.isPending;
  const canSubmit =
    !!selected &&
    !!(label || selected.label).trim() &&
    !missingRequired &&
    (!isTokenPaste || token.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        {step === "pick" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add a storage remote</DialogTitle>
              <DialogDescription>
                Pick a provider to connect. You can add as many remotes as you
                like.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {isLoading || !catalog
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))
                : catalog.map((info) => {
                    const Icon = remoteIcon(info.type);
                    return (
                      <button
                        key={info.type}
                        onClick={() => pick(info)}
                        className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-accent/50 hover:bg-muted/50"
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {info.label}
                          </p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {info.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
            </div>
          </>
        ) : (
          selected && (
            <>
              <DialogHeader>
                {connectPhase === "idle" && (
                  <button
                    onClick={() => setStep("pick")}
                    className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-3.5" />
                    All providers
                  </button>
                )}
                <DialogTitle>Connect {selected.label}</DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>

              {connectPhase !== "idle" ? (
                <>
                  <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
                    {connectPhase === "connecting" ? (
                      <>
                        <Loader2 className="size-7 animate-spin text-accent" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            Connecting…
                          </p>
                          <p className="text-[13px] text-muted-foreground leading-relaxed">
                            Continue in the Google tab that just opened, then
                            come back here.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-7 text-synced" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            Connected ✓
                          </p>
                          <p className="text-[13px] text-muted-foreground">
                            Wrapping up…
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  {connectPhase === "connecting" && (
                    <DialogFooter>
                      <Button variant="outline" onClick={cancelConnect}>
                        Cancel
                      </Button>
                    </DialogFooter>
                  )}
                </>
              ) : (
                <>
              <div className="max-h-[55vh] space-y-3.5 overflow-y-auto pr-1">
                <Field label="Label" htmlFor="remote-label" required>
                  <Input
                    id="remote-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="My backup target"
                  />
                </Field>

                {isGoogle ? (
                  <div className="space-y-3.5">
                    <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                      You'll be redirected to Google to authorize access, then
                      returned here. The server must have GOOGLE_CLIENT_ID and
                      GOOGLE_CLIENT_SECRET configured (see SETUP.md).
                    </p>

                    <div className="rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => setDriveTokenMode((v) => !v)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-foreground"
                        aria-expanded={driveTokenMode}
                      >
                        Advanced: paste an rclone token
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform ${
                            driveTokenMode ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {driveTokenMode && (
                        <div className="border-t border-border p-3">
                          <Field
                            label="rclone token"
                            htmlFor="remote-token"
                            required
                            hint='On any computer with a browser, install rclone and run rclone authorize "drive", complete the Google sign-in, then paste the resulting token JSON here. Use this when you access DriveHub via an IP address (Google blocks IP redirect URLs).'
                          >
                            <Textarea
                              id="remote-token"
                              value={token}
                              onChange={(e) => setToken(e.target.value)}
                              placeholder='{"access_token":"...","token_type":"bearer",...}'
                              className="min-h-[96px]"
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  </div>
                ) : isTokenPaste ? (
                  <Field
                    label="rclone token"
                    htmlFor="remote-token"
                    required
                    hint={`Run rclone authorize "${selected.type}" on any machine, then paste the JSON token it prints here.`}
                  >
                    <Textarea
                      id="remote-token"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder='{"access_token":"...","token_type":"bearer",...}'
                      className="min-h-[96px]"
                    />
                  </Field>
                ) : (
                  <RemoteTypeFields
                    fields={selected.fields}
                    values={params}
                    onChange={(k, v) =>
                      setParams((prev) => ({ ...prev, [k]: v }))
                    }
                  />
                )}

                {connectHint && (
                  <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                    {connectHint}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button
                  variant="accent"
                  disabled={!canSubmit || busy}
                  onClick={submit}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {isGoogleRedirect ? (
                    <>
                      Connect with Google
                      <ExternalLink className="size-3.5" />
                    </>
                  ) : (
                    "Add remote"
                  )}
                </Button>
              </DialogFooter>
                </>
              )}
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
