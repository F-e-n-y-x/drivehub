import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AppSettings, JobInput, LogLevel } from "@drivehub/types";
import {
  api,
  qk,
  type CreateRemoteInput,
  type IcloudStartInput,
  type OAuthTokenInput,
  type TransferOpInput,
} from "@/lib/api";
import { toast } from "@/components/ui/toast";

// --- Reads ----------------------------------------------------------------

export function useStatus() {
  return useQuery({
    queryKey: qk.status,
    queryFn: api.status,
    // SSE keeps this fresh; poll slowly as a fallback.
    refetchInterval: 30_000,
  });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.settings });
}

export function useRemoteCatalog() {
  return useQuery({
    queryKey: qk.catalog,
    queryFn: api.remoteCatalog,
    staleTime: Infinity,
  });
}

export function useRemotes() {
  return useQuery({ queryKey: qk.remotes, queryFn: api.remotes });
}

/**
 * Storage usage (total/used/free) for one remote. Cheap-ish but provider-
 * dependent, so we cache it for a minute. `enabled` lets cards mount before a
 * remote id is known without firing a bad request.
 */
export function useRemoteAbout(id: string | null) {
  return useQuery({
    queryKey: qk.remoteAbout(id ?? ""),
    queryFn: () => api.getRemoteAbout(id as string),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useJobs() {
  return useQuery({ queryKey: qk.jobs, queryFn: api.jobs });
}

export function useRuns() {
  return useQuery({ queryKey: qk.runs, queryFn: api.runs });
}

export function useJobRuns(jobId: string | null) {
  return useQuery({
    queryKey: qk.jobRuns(jobId ?? ""),
    queryFn: () => api.jobRuns(jobId as string),
    enabled: !!jobId,
  });
}

export function useBrowse(remoteId: string | null, path: string) {
  return useQuery({
    queryKey: qk.browse(remoteId ?? "", path),
    queryFn: () => api.browse(remoteId as string, path),
    enabled: !!remoteId,
  });
}

export function useFsBrowse(path: string) {
  return useQuery({
    queryKey: qk.fs(path),
    queryFn: () => api.browseFs(path || undefined),
    // Filesystem listings are cheap to refetch and rarely change mid-session.
    staleTime: 10_000,
  });
}

export function useActivity(search: string) {
  return useQuery({
    queryKey: qk.activity(search),
    queryFn: () => api.activity({ limit: 100, search: search || undefined }),
  });
}

export function useUpdates() {
  return useQuery({
    queryKey: qk.updates,
    queryFn: api.getUpdates,
    // Update checks are slow-moving; SSE pushes fresher data when it changes.
    staleTime: 60 * 60_000,
    refetchOnMount: true,
  });
}

export function useSystem() {
  return useQuery({
    queryKey: qk.system,
    queryFn: api.getSystem,
    staleTime: 60_000,
    refetchOnMount: true,
  });
}

export function useTerminal() {
  return useQuery({
    queryKey: ["terminal"],
    queryFn: api.getTerminal,
    staleTime: 30_000,
  });
}

export function useSetTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.setTerminal(enabled),
    onSuccess: (s) => {
      qc.setQueryData(["terminal"], s);
      qc.invalidateQueries({ queryKey: ["terminal"] });
    },
    onError: (e: Error) =>
      toast.error("Couldn't change the terminal", { description: e.message }),
  });
}

// --- Engine ---------------------------------------------------------------

export function useEngineControl() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.status });

  const pause = useMutation({
    mutationFn: api.pauseEngine,
    onSuccess: () => {
      invalidate();
      toast.success("Engine paused");
    },
    onError: (e: Error) =>
      toast.error("Couldn't pause", { description: e.message }),
  });

  const resume = useMutation({
    mutationFn: api.resumeEngine,
    onSuccess: () => {
      invalidate();
      toast.success("Engine resumed");
    },
    onError: (e: Error) =>
      toast.error("Couldn't resume", { description: e.message }),
  });

  return { pause, resume };
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AppSettings) => api.updateSettings(body),
    onSuccess: (saved) => {
      qc.setQueryData(qk.settings, saved);
      qc.invalidateQueries({ queryKey: qk.status });
      toast.success("Settings saved");
    },
    onError: (e: Error) =>
      toast.error("Couldn't save settings", { description: e.message }),
  });
}

// --- Remotes --------------------------------------------------------------

export function useRemoteMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.remotes });
    qc.invalidateQueries({ queryKey: qk.status });
  };

  const create = useMutation({
    mutationFn: (body: CreateRemoteInput) => api.createRemote(body),
    onSuccess: (r) => {
      refresh();
      toast.success("Remote added", { description: r.label });
    },
    onError: (e: Error) =>
      toast.error("Couldn't add remote", { description: e.message }),
  });

  const createOAuth = useMutation({
    mutationFn: (body: OAuthTokenInput) => api.createOAuthRemote(body),
    onSuccess: (r) => {
      refresh();
      toast.success("Remote connected", { description: r.label });
    },
    onError: (e: Error) =>
      toast.error("Couldn't connect remote", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRemote(id),
    onSuccess: () => {
      refresh();
      toast.success("Remote removed");
    },
    onError: (e: Error) =>
      toast.error("Couldn't remove remote", { description: e.message }),
  });

  const test = useMutation({
    mutationFn: (id: string) => api.testRemote(id),
    onSuccess: (res) => {
      refresh();
      if (res.ok) toast.success("Connection OK");
      else
        toast.error("Connection failed", {
          description: res.error ?? "The remote did not respond.",
        });
    },
    onError: (e: Error) =>
      toast.error("Test failed", { description: e.message }),
  });

  // iCloud's two-step (2FA) connect. The dialog drives the step flow and
  // handles success/error UI; these mutations just call the endpoints and
  // refresh the remotes list once a remote is finalized.
  const startIcloud = useMutation({
    mutationFn: (body: IcloudStartInput) => api.startIcloud(body),
    onSuccess: (res) => {
      if (res.status === "done") refresh();
    },
  });

  const verifyIcloud = useMutation({
    mutationFn: (body: { sessionId: string; code: string }) =>
      api.verifyIcloud(body),
    onSuccess: (res) => {
      if (res.status === "done") refresh();
    },
  });

  return { create, createOAuth, remove, test, startIcloud, verifyIcloud };
}

/**
 * Rename (relabel) a remote. Invalidates the remotes list so cards refresh, and
 * toasts on success/error. Kept standalone so the remote card can use it
 * without pulling in the full mutation bundle.
 */
export function useRenameRemote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label, email }: { id: string; label: string; email?: string }) =>
      api.renameRemote(id, label, email),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: qk.remotes });
      qc.invalidateQueries({ queryKey: qk.status });
      toast.success("Remote updated", { description: r.label });
    },
    onError: (e: Error) =>
      toast.error("Couldn't rename remote", { description: e.message }),
  });
}

/**
 * Last persisted speed-test result for a remote (null if never run). Survives
 * navigation/reload because the backend stores it. `enabled` guards against a
 * missing id while a card mounts.
 */
export function useSpeedTest(id: string | null) {
  return useQuery({
    queryKey: qk.speedTest(id ?? ""),
    queryFn: () => api.getSpeedTest(id as string),
    enabled: !!id,
  });
}

/**
 * On-demand speed test for a remote. Returns the mutation so the card can show
 * a per-remote running state; on success it writes the fresh result into the
 * `qk.speedTest(id)` cache so the card reflects it immediately. Errors toasted.
 */
export function useRunSpeedTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.speedTest(id),
    onSuccess: (res, id) => {
      qc.setQueryData(qk.speedTest(id), res);
    },
    onError: (e: Error) =>
      toast.error("Speed test failed", { description: e.message }),
  });
}

// --- Remote file-manager ops ----------------------------------------------

/**
 * Mutations for the file explorer, scoped to the folder currently shown
 * (`remoteId` + `path`). Every op invalidates that folder's `browse` query so
 * the listing refreshes, and toasts on success/error. Paste may target a
 * different remote, so it invalidates the whole `browse` namespace.
 */
export function useBrowseMutations(remoteId: string, path: string) {
  const qc = useQueryClient();
  const refresh = () =>
    qc.invalidateQueries({ queryKey: qk.browse(remoteId, path) });

  const mkdir = useMutation({
    mutationFn: (name: string) => api.mkdir(remoteId, joinPath(path, name)),
    onSuccess: () => {
      refresh();
      toast.success("Folder created");
    },
    onError: (e: Error) =>
      toast.error("Couldn't create folder", { description: e.message }),
  });

  const touch = useMutation({
    mutationFn: (name: string) => api.touch(remoteId, joinPath(path, name)),
    onSuccess: () => {
      refresh();
      toast.success("File created");
    },
    onError: (e: Error) =>
      toast.error("Couldn't create file", { description: e.message }),
  });

  const rename = useMutation({
    mutationFn: ({ entryPath, newName }: { entryPath: string; newName: string }) =>
      api.rename(remoteId, entryPath, newName),
    onSuccess: () => {
      refresh();
      toast.success("Renamed");
    },
    onError: (e: Error) =>
      toast.error("Couldn't rename", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (entries: { path: string; isDir: boolean }[]) =>
      Promise.all(entries.map((e) => api.deleteEntry(remoteId, e.path, e.isDir))),
    onSuccess: (_res, entries) => {
      refresh();
      toast.success(
        entries.length === 1 ? "Deleted" : `Deleted ${entries.length} items`,
      );
    },
    onError: (e: Error) =>
      toast.error("Couldn't delete", { description: e.message }),
  });

  const paste = useMutation({
    mutationFn: (ops: TransferOpInput[]) =>
      Promise.all(ops.map((o) => api.transferOp(o))),
    onSuccess: (_res, ops) => {
      // Paste can write into this remote (and read from another); refresh all.
      qc.invalidateQueries({ queryKey: ["browse"] });
      const verb = ops[0]?.op === "move" ? "Moved" : "Copied";
      toast.success(
        ops.length === 1 ? `${verb} 1 item` : `${verb} ${ops.length} items`,
      );
    },
    onError: (e: Error) =>
      toast.error("Couldn't paste", { description: e.message }),
  });

  return { mkdir, touch, rename, remove, paste };
}

/** Joins a folder path and a leaf name without leading/duplicate slashes. */
function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

// --- Jobs -----------------------------------------------------------------

export function useJobMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.jobs });
    qc.invalidateQueries({ queryKey: qk.status });
  };

  const create = useMutation({
    mutationFn: (body: JobInput) => api.createJob(body),
    onSuccess: (j) => {
      refresh();
      toast.success("Job created", { description: j.name });
    },
    onError: (e: Error) =>
      toast.error("Couldn't create job", { description: e.message }),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: JobInput }) =>
      api.updateJob(id, body),
    onSuccess: (j) => {
      refresh();
      toast.success("Job updated", { description: j.name });
    },
    onError: (e: Error) =>
      toast.error("Couldn't update job", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteJob(id),
    onSuccess: () => {
      refresh();
      toast.success("Job deleted");
    },
    onError: (e: Error) =>
      toast.error("Couldn't delete job", { description: e.message }),
  });

  const run = useMutation({
    mutationFn: (id: string) => api.runJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.jobs });
      toast.success("Job started");
    },
    onError: (e: Error) =>
      toast.error("Couldn't start job", { description: e.message }),
  });

  return { create, update, remove, run };
}

// --- Updates --------------------------------------------------------------

export function useUpdateActions() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.updates });
    qc.invalidateQueries({ queryKey: qk.status });
  };

  const checkNow = useMutation({
    mutationFn: api.checkUpdates,
    onSuccess: (status) => {
      qc.setQueryData(qk.updates, status);
      qc.invalidateQueries({ queryKey: qk.status });
      toast.success(
        status.anyAvailable ? "Updates available" : "Everything is up to date",
      );
    },
    onError: (e: Error) =>
      toast.error("Couldn't check for updates", { description: e.message }),
  });

  const updateRclone = useMutation({
    mutationFn: api.updateRclone,
    onSuccess: (res) => {
      qc.setQueryData(qk.updates, res.updates);
      refresh();
      toast.success("rclone updated", { description: res.message });
    },
    onError: (e: Error) =>
      toast.error("Couldn't update rclone", { description: e.message }),
  });

  return { checkNow, updateRclone };
}

// --- Logs -----------------------------------------------------------------

export function useLogLevel() {
  return useQuery({
    queryKey: qk.logLevel,
    queryFn: api.getLogLevel,
    staleTime: 60_000,
  });
}

export function useSetLogLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (level: LogLevel) => api.setLogLevel(level),
    onSuccess: ({ level }) => {
      qc.setQueryData(qk.logLevel, { level });
      toast.success("Log level set", { description: level });
    },
    onError: (e: Error) =>
      toast.error("Couldn't set log level", { description: e.message }),
  });
}
