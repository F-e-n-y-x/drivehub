import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { useRemoteMutations } from "@/hooks/queries";
import { toast } from "@/components/ui/toast";

/** A single editable rclone config key/value pair. */
interface ConfigRow {
  key: string;
  value: string;
  secret: boolean;
}

const emptyRow = (): ConfigRow => ({ key: "", value: "", secret: false });

/**
 * Hand-built form for the `custom` provider. Unlike the catalog-driven
 * providers, the user supplies an arbitrary rclone backend name plus a free
 * set of config keys. We post `{ type: "custom", label, params }` where
 * `params.__backend` is the rclone backend and the rest are its config keys.
 */
export function CustomRemoteForm({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const { create } = useRemoteMutations();

  const [label, setLabel] = useState("Custom remote");
  const [backend, setBackend] = useState("");
  const [rows, setRows] = useState<ConfigRow[]>([emptyRow()]);

  const updateRow = (index: number, patch: Partial<ConfigRow>) =>
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (index: number) =>
    setRows((prev) =>
      prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== index),
    );

  const canSubmit =
    label.trim().length > 0 &&
    backend.trim().length > 0 &&
    !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    // Build params: __backend plus every non-empty key/value (last wins on
    // duplicate keys). Empty rows are dropped.
    const params: Record<string, string> = { __backend: backend.trim() };
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      params[key] = row.value;
    }
    create.mutate(
      { type: "custom", label: label.trim(), params },
      {
        onSuccess: () => onClose(),
        onError: (e: Error) =>
          toast.error("Couldn't add remote", { description: e.message }),
      },
    );
  };

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
        <DialogTitle>Custom / other (advanced)</DialogTitle>
        <DialogDescription>
          Configure any rclone backend by hand. Provide the backend name and
          its config keys.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[55vh] space-y-3.5 overflow-y-auto pr-1">
        <Field label="Label" htmlFor="custom-label" required>
          <Input
            id="custom-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My backup target"
          />
        </Field>

        <Field
          label="rclone backend"
          htmlFor="custom-backend"
          required
          hint="The rclone backend name. See rclone.org/overview for the list. Some backends (e.g. TeraBox) require a compatible rclone build set via RCLONE_BIN."
        >
          <Input
            id="custom-backend"
            value={backend}
            onChange={(e) => setBackend(e.target.value)}
            placeholder="pcloud, mega, koofr, storj, box, terabox…"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13px]"
          />
        </Field>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-foreground">Config keys</p>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  aria-label={`Config key ${i + 1}`}
                  value={row.key}
                  onChange={(e) => updateRow(i, { key: e.target.value })}
                  placeholder="key"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-[13px]"
                />
                <div className="relative flex-1">
                  <Input
                    aria-label={`Config value ${i + 1}`}
                    type={row.secret ? "password" : "text"}
                    value={row.value}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    placeholder="value"
                    autoComplete="off"
                    spellCheck={false}
                    className="pr-9 font-mono text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() => updateRow(i, { secret: !row.secret })}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground/70 hover:text-foreground"
                    aria-label={
                      row.secret ? "Show value" : "Hide value (treat as secret)"
                    }
                  >
                    {row.secret ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4" />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove config row ${i + 1}`}
                  className="shrink-0 text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-3.5" />
            Add field
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="accent"
          disabled={!canSubmit}
          onClick={submit}
        >
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          Add remote
        </Button>
      </DialogFooter>
    </>
  );
}
