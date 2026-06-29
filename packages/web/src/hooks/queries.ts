import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AppSettings, JobInput } from "@drivehub/types";
import { api, qk, type CreateRemoteInput, type OAuthTokenInput } from "@/lib/api";
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

  return { create, createOAuth, remove, test };
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
