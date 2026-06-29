import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HardDrive, Plus } from "lucide-react";
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

  // Handle redirect back from the Google OAuth flow.
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((r) => (
            <RemoteCard key={r.id} remote={r} />
          ))}
        </div>
      )}

      <AddRemoteDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
