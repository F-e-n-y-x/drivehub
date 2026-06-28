import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AppSettings } from "@drivehub/types";
import { api, qk } from "@/lib/api";
import { toast } from "@/components/ui/toast";

export function useStatus() {
  return useQuery({
    queryKey: qk.status,
    queryFn: api.status,
    // SSE keeps this fresh; poll slowly as a fallback.
    refetchInterval: 30_000,
  });
}

export function useAccounts() {
  return useQuery({ queryKey: qk.accounts, queryFn: api.accounts });
}

export function useDriveListing(accountId: string | null, folderId: string) {
  return useQuery({
    queryKey: qk.drive(accountId ?? "", folderId),
    queryFn: () => api.drive(accountId as string, folderId),
    enabled: !!accountId,
  });
}

export function useActivity(search: string) {
  return useQuery({
    queryKey: qk.activity(search),
    queryFn: () => api.activity({ limit: 100, search: search || undefined }),
  });
}

export function useConflicts() {
  return useQuery({ queryKey: qk.conflicts, queryFn: api.conflicts });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.settings });
}

export function useEngineControl() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.status });

  const pause = useMutation({
    mutationFn: api.pauseEngine,
    onSuccess: () => {
      invalidate();
      toast.success("Sync paused");
    },
    onError: (e: Error) => toast.error("Couldn't pause", { description: e.message }),
  });

  const resume = useMutation({
    mutationFn: api.resumeEngine,
    onSuccess: () => {
      invalidate();
      toast.success("Sync resumed");
    },
    onError: (e: Error) =>
      toast.error("Couldn't resume", { description: e.message }),
  });

  return { pause, resume };
}

export function useAccountControl() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.accounts });
    qc.invalidateQueries({ queryKey: qk.status });
  };

  const pause = useMutation({
    mutationFn: (id: string) => api.pauseAccount(id),
    onSuccess: () => {
      refresh();
      toast.success("Account paused");
    },
    onError: (e: Error) => toast.error("Couldn't pause account", { description: e.message }),
  });

  const resume = useMutation({
    mutationFn: (id: string) => api.resumeAccount(id),
    onSuccess: () => {
      refresh();
      toast.success("Account resumed");
    },
    onError: (e: Error) => toast.error("Couldn't resume account", { description: e.message }),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => {
      refresh();
      toast.success("Account disconnected");
    },
    onError: (e: Error) =>
      toast.error("Couldn't disconnect", { description: e.message }),
  });

  return { pause, resume, disconnect };
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

export function useResolveConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.resolveConflict(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.conflicts });
      toast.success("Conflict resolved");
    },
    onError: (e: Error) =>
      toast.error("Couldn't resolve conflict", { description: e.message }),
  });
}
