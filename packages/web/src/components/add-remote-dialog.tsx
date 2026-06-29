import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Layers,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { RemoteTypeInfo } from "@drivehub/types";
import type { IcloudStepResult } from "@/lib/api";
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
import { CustomRemoteForm } from "@/components/custom-remote-form";
import { FolderPicker } from "@/components/folder-picker";
import { RemoteIcon } from "@/components/brand-icon";
import {
  useAlist,
  useRemoteCatalog,
  useRemoteMutations,
  useRemotes,
} from "@/hooks/queries";
import { toast } from "@/components/ui/toast";

type Step = "pick" | "form" | "icloud-2fa";

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
  const { create, createOAuth, startIcloud, verifyIcloud } =
    useRemoteMutations();
  const { data: remotes } = useRemotes();

  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<RemoteTypeInfo | null>(null);
  const [label, setLabel] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");

  // iCloud 2FA step state.
  const [icloudSession, setIcloudSession] = useState<string | null>(null);
  const [icloudPrompt, setIcloudPrompt] = useState("");
  const [icloudCode, setIcloudCode] = useState("");
  const [icloudError, setIcloudError] = useState<string | null>(null);
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
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the detection effect so the "new remote" -> connected transition
  // (and the close timer it schedules) can fire exactly once.
  const connectedRef = useRef(false);

  const clearConnectTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const reset = () => {
    clearConnectTimeout();
    clearCloseTimeout();
    connectedRef.current = false;
    knownIdsRef.current = new Set();
    setStep("pick");
    setSelected(null);
    setLabel("");
    setParams({});
    setToken("");
    setDriveTokenMode(false);
    setConnectPhase("idle");
    setConnectHint(null);
    setIcloudSession(null);
    setIcloudPrompt("");
    setIcloudCode("");
    setIcloudError(null);
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
  const isLocal = selected?.type === "local";
  const isIcloud = selected?.type === "icloud";
  const isOtherOAuth =
    selected?.oauth && (selected.type === "dropbox" || selected.type === "onedrive");
  // Drive uses redirect by default, but can paste a token in "advanced" mode.
  const isGoogleRedirect = isGoogle && !driveTokenMode;
  // Any path that submits an rclone token JSON.
  const isTokenPaste = isOtherOAuth || (isGoogle && driveTokenMode);

  // Detect a freshly-connected OAuth remote: while we're waiting on the Google
  // tab, watch the remotes list for an id we hadn't seen at click time. This
  // must fire its success/close exactly once — guard with a ref so re-renders
  // (e.g. further `remotes` updates) can't re-trigger it or clear the close
  // timer. The close timer lives in a ref, NOT in this effect's cleanup, so it
  // can't be cancelled by a re-render.
  useEffect(() => {
    if (connectPhase !== "connecting" || connectedRef.current || !remotes) {
      return;
    }
    const fresh = remotes.find((r) => !knownIdsRef.current.has(r.id));
    if (!fresh) return;
    connectedRef.current = true;
    clearConnectTimeout();
    setConnectPhase("connected");
    toast.success("Google Drive connected", { description: fresh.label });
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      close(false);
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectPhase, remotes]);

  // Clean up any pending timers if the dialog unmounts.
  useEffect(
    () => () => {
      clearConnectTimeout();
      clearCloseTimeout();
    },
    [],
  );

  const startRedirectConnect = (info: RemoteTypeInfo) => {
    connectedRef.current = false;
    clearCloseTimeout();
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
    clearCloseTimeout();
    connectedRef.current = false;
    setConnectPhase("idle");
    setConnectHint(null);
  };

  // Shared handler for both iCloud steps: a `done` result closes the dialog
  // (the mutation's onSuccess already invalidated qk.remotes); a `need_2fa`
  // result moves us into / keeps us on the verification step.
  const handleIcloudResult = (res: IcloudStepResult) => {
    setIcloudError(null);
    if (res.status === "done") {
      toast.success("iCloud connected", { description: res.remote.label });
      close(false);
      return;
    }
    setIcloudSession(res.sessionId);
    setIcloudPrompt(res.prompt);
    setIcloudCode("");
    setStep("icloud-2fa");
  };

  const submit = () => {
    if (!selected) return;
    if (isIcloud) {
      setIcloudError(null);
      startIcloud.mutate(
        {
          label: label || selected.label,
          apple_id: (params.apple_id ?? "").trim(),
          password: params.password ?? "",
        },
        {
          onSuccess: handleIcloudResult,
          onError: (e: Error) => {
            setIcloudError(e.message);
            toast.error("Couldn't connect iCloud", { description: e.message });
          },
        },
      );
      return;
    }
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

  const submitIcloudCode = () => {
    if (!icloudSession || icloudCode.trim().length === 0) return;
    setIcloudError(null);
    verifyIcloud.mutate(
      { sessionId: icloudSession, code: icloudCode.trim() },
      {
        onSuccess: handleIcloudResult,
        onError: (e: Error) => {
          setIcloudError(e.message);
          toast.error("Verification failed", { description: e.message });
        },
      },
    );
  };

  const busy =
    create.isPending ||
    createOAuth.isPending ||
    startIcloud.isPending ||
    verifyIcloud.isPending;
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
                    return (
                      <button
                        key={info.type}
                        onClick={() => pick(info)}
                        className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-accent/50 hover:bg-muted/50"
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                          <RemoteIcon type={info.type} className="size-4" />
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
        ) : step === "icloud-2fa" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-accent" />
                Enter verification code
              </DialogTitle>
              <DialogDescription>
                {icloudPrompt ||
                  "Apple sent a verification code to your trusted devices."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5">
              <Field label="Verification code" htmlFor="icloud-code" required>
                <Input
                  id="icloud-code"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={icloudCode}
                  onChange={(e) =>
                    setIcloudCode(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && icloudCode.trim().length > 0) {
                      e.preventDefault();
                      submitIcloudCode();
                    }
                  }}
                  placeholder="123456"
                  className="text-center font-mono text-lg tracking-[0.4em]"
                />
              </Field>

              {icloudError && (
                <p className="rounded-lg bg-danger/[0.06] px-3 py-2.5 text-xs text-danger leading-relaxed">
                  {icloudError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  // Back to the credentials form to retry from the top.
                  setIcloudSession(null);
                  setIcloudCode("");
                  setIcloudError(null);
                  setStep("form");
                }}
              >
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
              <Button
                variant="accent"
                disabled={busy || icloudCode.trim().length === 0}
                onClick={submitIcloudCode}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Verify
              </Button>
            </DialogFooter>
          </>
        ) : selected?.type === "custom" ? (
          <CustomRemoteForm
            onBack={() => setStep("pick")}
            onClose={() => close(false)}
          />
        ) : selected?.type === "terabox" ? (
          <TeraBoxPanel
            onBack={() => setStep("pick")}
            onClose={() => close(false)}
          />
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
                ) : isLocal ? (
                  <Field label="Folder" required>
                    <FolderPicker
                      value={params.path ?? ""}
                      onChange={(path) =>
                        setParams((prev) => ({ ...prev, path }))
                      }
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
                  ) : isIcloud ? (
                    "Continue"
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

/**
 * TeraBox guidance panel. TeraBox has no official API, so DriveHub reaches it
 * through the built-in AList rather than creating a remote directly — this
 * panel explains that and routes the user to the right next step instead of
 * showing the (empty) generic create form.
 */
function TeraBoxPanel({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const { data: alist, isLoading } = useAlist();
  const ready = alist?.enabled && alist.running;
  const adminUrl = alist
    ? `http://${window.location.hostname}:${alist.port}`
    : "";

  return (
    <>
      <DialogHeader>
        <button
          onClick={onBack}
          className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All providers
        </button>
        <DialogTitle className="flex items-center gap-2">
          <RemoteIcon type="terabox" className="size-4" />
          Connect TeraBox
        </DialogTitle>
        <DialogDescription>
          TeraBox has no official API, so DriveHub connects it through the
          built-in AList.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3.5">
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : ready ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <Layers className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Add a TeraBox storage in AList; it then appears under your{" "}
                <span className="font-medium text-foreground">
                  AList (built-in)
                </span>{" "}
                remote here.
              </p>
            </div>
            {alist?.adminPassword && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-[13px]">
                <p className="mb-1.5 font-medium text-foreground">Sign in to AList with</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">User</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {alist.adminUser}
                  </code>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Password</span>
                  <code className="max-w-[60%] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {alist.adminPassword}
                  </code>
                </div>
              </div>
            )}
            <Button
              variant="accent"
              className="w-full"
              onClick={() => window.open(adminUrl, "_blank", "noopener")}
            >
              Open AList to add TeraBox
              <ExternalLink className="size-3.5" />
            </Button>
          </>
        ) : (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3.5 text-[13px] text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground">
              Enable the built-in AList first
            </p>
            <p>
              Set{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                ENABLE_ALIST=true
              </code>{" "}
              in your DriveHub container (and map port{" "}
              <span className="tabular-nums">{alist?.port ?? 5244}</span>), then
              restart.
            </p>
            <p>
              See{" "}
              <a
                href="https://github.com/F-e-n-y-x/drivehub/blob/main/SETUP.md#terabox"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
              >
                SETUP.md
                <ExternalLink className="size-3" />
              </a>{" "}
              for details.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Advanced: a TeraBox-capable rclone build (RCLONE_BIN) plus a Custom
              remote also works.
            </p>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
