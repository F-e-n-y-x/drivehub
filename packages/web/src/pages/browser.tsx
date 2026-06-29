import { useEffect, useState } from "react";
import { FolderTree, HardDrive } from "lucide-react";
import { useRemotes } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { RemoteBrowser } from "@/components/remote-browser";
import { remoteTypeLabel } from "@/lib/remotes";

export function BrowserPage() {
  const { data: remotes, isLoading } = useRemotes();
  const [remoteId, setRemoteId] = useState("");

  // Default to the first remote once loaded.
  useEffect(() => {
    if (!remoteId && remotes && remotes.length > 0) {
      setRemoteId(remotes[0]!.id);
    }
  }, [remotes, remoteId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remote Browser"
        description="Inspect the contents of any connected remote."
      />

      {isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : !remotes || remotes.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No remotes to browse"
          description="Connect a storage remote to browse its files here."
        />
      ) : (
        <Card className="space-y-4 p-5">
          <div className="max-w-xs">
            <Select
              value={remoteId}
              onChange={(e) => setRemoteId(e.target.value)}
              aria-label="Select remote"
            >
              {remotes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} · {remoteTypeLabel(r.type)}
                </option>
              ))}
            </Select>
          </div>

          {remoteId ? (
            <RemoteBrowser key={remoteId} remoteId={remoteId} />
          ) : (
            <EmptyState
              icon={FolderTree}
              title="Pick a remote"
              description="Choose a remote above to start browsing."
              className="border-0 bg-transparent"
            />
          )}
        </Card>
      )}
    </div>
  );
}
