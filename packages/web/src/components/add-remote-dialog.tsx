import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
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
import { useRemoteCatalog, useRemoteMutations } from "@/hooks/queries";

type Step = "pick" | "form";

export function AddRemoteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: catalog, isLoading } = useRemoteCatalog();
  const { create, createOAuth } = useRemoteMutations();

  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<RemoteTypeInfo | null>(null);
  const [label, setLabel] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");

  const reset = () => {
    setStep("pick");
    setSelected(null);
    setLabel("");
    setParams({});
    setToken("");
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
    setStep("form");
  };

  const missingRequired = useMemo(() => {
    if (!selected || selected.oauth) return false;
    return selected.fields.some(
      (f) => f.required && !(params[f.key] ?? "").trim(),
    );
  }, [selected, params]);

  const isTokenPaste =
    selected?.oauth && (selected.type === "dropbox" || selected.type === "onedrive");
  const isGoogle = selected?.type === "drive";

  const submit = () => {
    if (!selected) return;
    if (isGoogle) {
      // Navigate to the server OAuth start; it 302s to Google and back.
      window.location.href = `/api/oauth/google/start?label=${encodeURIComponent(
        label || selected.label,
      )}`;
      return;
    }
    if (isTokenPaste) {
      createOAuth.mutate(
        {
          type: selected.type as "dropbox" | "onedrive",
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
                <button
                  onClick={() => setStep("pick")}
                  className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                  All providers
                </button>
                <DialogTitle>Connect {selected.label}</DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>

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
                  <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                    You'll be redirected to Google to authorize access, then
                    returned here. The server must have GOOGLE_CLIENT_ID and
                    GOOGLE_CLIENT_SECRET configured (see SETUP.md).
                  </p>
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
                  {isGoogle ? (
                    <>
                      Connect Google Account
                      <ExternalLink className="size-3.5" />
                    </>
                  ) : (
                    "Add remote"
                  )}
                </Button>
              </DialogFooter>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
