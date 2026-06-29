import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, HardDrive, Plus } from "lucide-react";
import { useRemotes } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { RemoteCard } from "@/components/remote-card";
import { AddRemoteDialog } from "@/components/add-remote-dialog";
import { toast } from "@/components/ui/toast";

export function RemotesPage() {
  const { data, isLoading, isError, refetch } = useRemotes();
  const [adding, setAdding] = useState(false);
  const [params, setParams] = useSearchParams();

  // When this page was opened *as the OAuth tab* (via window.open from the Add
  // Remote dialog), close it automatically so the user lands back on the
  // original DriveHub tab — the dialog there detects the new remote live.
  const [returning, setReturning] = useState(false);

  // Handle redirect back from the Google OAuth flow.
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    const openedAsTab = typeof window !== "undefined" && !!window.opener;

    if ((connected || error) && openedAsTab) {
      // This is the popup/new tab returning from Google. Show a brief state and
      // close so focus returns to the original tab, which handles the toast and
      // list refresh itself.
      setReturning(true);
      const t = setTimeout(() => window.close(), 1000);
      return () => clearTimeout(t);
    }

    if (connected) {
      toast.success("Remote connected", { description: connected });
      refetch();
    }
    if (error === "google_not_configured") {
      toast.error("Google not configured", {
        description:
          "The server needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set. See SETUP.md.",
        duration: 8000,
      });
    } else if (error) {
      toast.error("Couldn't connect", { description: error });
    }
    if (connected || error) {
      params.delete("connected");
      params.delete("error");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (returning) {
    const ok = !params.get("error");
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        {ok ? (
          <CheckCircle2 className="size-8 text-synced" />
        ) : (
          <HardDrive className="size-8 text-muted-foreground" />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {ok ? "Connected ✓" : "Couldn't connect"}
          </p>
          <p className="text-[13px] text-muted-foreground">
            Returning you to DriveHub…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remotes"
        description="Storage endpoints DriveHub can sync to and from."
        actions={
          <Button variant="accent" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add remote
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No remotes yet"
          description="Connect your first storage provider — local disk, S3, Google Drive, Dropbox and more — to start backing up."
          action={
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add your first remote
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.map((r) => (
            <RemoteCard key={r.id} remote={r} />
          ))}
        </div>
      )}

      <AddRemoteDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
