import { useMemo, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import type {
  JobInput,
  JobMode,
  JobPublic,
  JobType,
  RemotePublic,
  Schedule,
  ScheduleKind,
} from "@drivehub/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/field";
import { PathPickerDialog } from "@/components/path-picker-dialog";
import { modeHelp, modeLabel, WEEKDAYS } from "@/lib/remotes";
import { useJobMutations, useRemotes } from "@/hooks/queries";

const MODES: JobMode[] = ["two_way", "mirror", "additive"];

function defaultInput(): JobInput {
  return {
    name: "",
    type: "sync",
    sourceRemoteId: "",
    sourcePath: "",
    destRemoteId: "",
    destPath: "",
    mode: "additive",
    schedule: { kind: "manual" },
    enabled: true,
    snapshot: { retentionKeep: 7, compressionLevel: 6 },
    quiesceContainers: [],
  };
}

function fromJob(j: JobPublic): JobInput {
  return {
    name: j.name,
    type: j.type,
    sourceRemoteId: j.sourceRemoteId,
    sourcePath: j.sourcePath,
    destRemoteId: j.destRemoteId,
    destPath: j.destPath,
    mode: j.mode,
    schedule: j.schedule,
    enabled: j.enabled,
    snapshot: j.snapshot,
    quiesceContainers: j.quiesceContainers,
  };
}

type PickerTarget = "source" | "dest" | null;

export function JobDialog({
  open,
  onOpenChange,
  job,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this job; otherwise it creates one. */
  job?: JobPublic | null;
}) {
  const { data: remotes } = useRemotes();
  const { create, update } = useJobMutations();
  const [form, setForm] = useState<JobInput>(() =>
    job ? fromJob(job) : defaultInput(),
  );
  const [picker, setPicker] = useState<PickerTarget>(null);

  // Re-seed when the target job changes / dialog reopens.
  const [seededFor, setSeededFor] = useState<string | "new">(job?.id ?? "new");
  const wantSeed = job?.id ?? "new";
  if (open && seededFor !== wantSeed) {
    setForm(job ? fromJob(job) : defaultInput());
    setSeededFor(wantSeed);
  }

  const set = <K extends keyof JobInput>(key: K, value: JobInput[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const setSchedule = (patch: Partial<Schedule>) =>
    setForm((p) => ({ ...p, schedule: { ...p.schedule, ...patch } }));

  const remoteOptions = remotes ?? [];
  const remoteLabel = (id: string) =>
    remoteOptions.find((r) => r.id === id)?.label ?? "remote";

  const isSnapshot = form.type === "snapshot";

  const canSubmit =
    form.name.trim().length > 0 &&
    !!form.sourceRemoteId &&
    !!form.destRemoteId;

  const submit = () => {
    const payload: JobInput = {
      ...form,
      name: form.name.trim(),
      quiesceContainers: form.quiesceContainers,
    };
    const opts = { onSuccess: () => onOpenChange(false) };
    if (job) update.mutate({ id: job.id, body: payload }, opts);
    else create.mutate(payload, opts);
  };

  const busy = create.isPending || update.isPending;

  const quiesceText = useMemo(
    () => form.quiesceContainers.join("\n"),
    [form.quiesceContainers],
  );

  const pickerRemoteId =
    picker === "source" ? form.sourceRemoteId : form.destRemoteId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{job ? "Edit job" : "Create job"}</DialogTitle>
          <DialogDescription>
            Move data from a source to a destination on a schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="job-name" required>
              <Input
                id="job-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Nightly photos backup"
              />
            </Field>
            <Field label="Type" htmlFor="job-type">
              <Select
                id="job-type"
                value={form.type}
                onChange={(e) => set("type", e.target.value as JobType)}
              >
                <option value="sync">Sync</option>
                <option value="snapshot">Snapshot (archive)</option>
              </Select>
            </Field>
          </div>

          {/* Source */}
          <Endpoint
            title="Source"
            remotes={remoteOptions}
            remoteId={form.sourceRemoteId}
            path={form.sourcePath}
            onRemote={(id) => set("sourceRemoteId", id)}
            onPath={(p) => set("sourcePath", p)}
            onBrowse={() => setPicker("source")}
          />

          {/* Destination */}
          <Endpoint
            title="Destination"
            remotes={remoteOptions}
            remoteId={form.destRemoteId}
            path={form.destPath}
            onRemote={(id) => set("destRemoteId", id)}
            onPath={(p) => set("destPath", p)}
            onBrowse={() => setPicker("dest")}
          />

          {!isSnapshot && (
            <Field label="Mode" hint={modeHelp(form.mode)}>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set("mode", m)}
                    className={
                      "rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors " +
                      (form.mode === m
                        ? "border-accent bg-accent-muted text-accent"
                        : "border-border text-muted-foreground hover:bg-muted/50")
                    }
                  >
                    {modeLabel(m)}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Schedule */}
          <ScheduleEditor schedule={form.schedule} onChange={setSchedule} />

          {isSnapshot && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
              <Field
                label="Retention (keep)"
                htmlFor="job-retention"
                hint="Older archives beyond this count are pruned."
              >
                <Input
                  id="job-retention"
                  type="number"
                  min={1}
                  value={form.snapshot.retentionKeep}
                  onChange={(e) =>
                    set("snapshot", {
                      ...form.snapshot,
                      retentionKeep: Number(e.target.value) || 1,
                    })
                  }
                />
              </Field>
              <Field
                label="Compression (0–9)"
                htmlFor="job-compression"
                hint="gzip level; 0 = none, 9 = smallest."
              >
                <Input
                  id="job-compression"
                  type="number"
                  min={0}
                  max={9}
                  value={form.snapshot.compressionLevel}
                  onChange={(e) =>
                    set("snapshot", {
                      ...form.snapshot,
                      compressionLevel: Math.max(
                        0,
                        Math.min(9, Number(e.target.value) || 0),
                      ),
                    })
                  }
                />
              </Field>
              <Field
                className="sm:col-span-2"
                label="Quiesce containers"
                htmlFor="job-quiesce"
                hint="Comma- or newline-separated Docker container names to pause during the snapshot for DB-consistent backups. Requires the Docker socket mounted."
              >
                <Textarea
                  id="job-quiesce"
                  value={quiesceText}
                  onChange={(e) =>
                    set(
                      "quiesceContainers",
                      e.target.value
                        .split(/[\n,]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="postgres&#10;redis"
                  className="min-h-[72px]"
                />
              </Field>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!canSubmit || busy} onClick={submit}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {job ? "Save changes" : "Create job"}
          </Button>
        </DialogFooter>

        {picker && pickerRemoteId && (
          <PathPickerDialog
            open={!!picker}
            onOpenChange={(o) => !o && setPicker(null)}
            remoteId={pickerRemoteId}
            remoteLabel={remoteLabel(pickerRemoteId)}
            initialPath={picker === "source" ? form.sourcePath : form.destPath}
            onSelect={(p) =>
              picker === "source" ? set("sourcePath", p) : set("destPath", p)
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Endpoint({
  title,
  remotes,
  remoteId,
  path,
  onRemote,
  onPath,
  onBrowse,
}: {
  title: string;
  remotes: RemotePublic[];
  remoteId: string;
  path: string;
  onRemote: (id: string) => void;
  onPath: (path: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-3 text-[13px] font-semibold text-foreground">{title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Remote" required>
          <Select
            value={remoteId}
            onChange={(e) => onRemote(e.target.value)}
          >
            <option value="">Select a remote…</option>
            {remotes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Path">
          <div className="flex gap-2">
            <Input
              value={path}
              onChange={(e) => onPath(e.target.value)}
              placeholder="/ (root)"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!remoteId}
              aria-label="Browse"
              onClick={onBrowse}
            >
              <FolderOpen className="size-4" />
            </Button>
          </div>
        </Field>
      </div>
    </div>
  );
}

function ScheduleEditor({
  schedule,
  onChange,
}: {
  schedule: Schedule;
  onChange: (patch: Partial<Schedule>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Schedule">
        <Select
          value={schedule.kind}
          onChange={(e) => onChange({ kind: e.target.value as ScheduleKind })}
        >
          <option value="realtime">Real-time</option>
          <option value="interval">Every N minutes</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="manual">Manual only</option>
        </Select>
      </Field>

      {schedule.kind === "interval" && (
        <Field label="Interval (minutes)">
          <Input
            type="number"
            min={1}
            value={schedule.intervalMinutes ?? 15}
            onChange={(e) =>
              onChange({ intervalMinutes: Number(e.target.value) || 1 })
            }
          />
        </Field>
      )}

      {(schedule.kind === "daily" || schedule.kind === "weekly") && (
        <Field label="Time of day">
          <Input
            type="time"
            value={schedule.timeOfDay ?? "02:00"}
            onChange={(e) => onChange({ timeOfDay: e.target.value })}
          />
        </Field>
      )}

      {schedule.kind === "weekly" && (
        <Field label="Weekday">
          <Select
            value={String(schedule.weekday ?? 1)}
            onChange={(e) => onChange({ weekday: Number(e.target.value) })}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}
