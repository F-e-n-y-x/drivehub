import { useState } from "react";
import { Search, ScrollText, Loader2 } from "lucide-react";
import { useActivity } from "@/hooks/queries";
import { useDebounced } from "@/hooks/use-debounced";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { ActivityItem } from "@/components/activity-item";

export function ActivityPage() {
  const [input, setInput] = useState("");
  const search = useDebounced(input.trim(), 300);
  const { data, isLoading, isError, refetch, isFetching } = useActivity(search);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="A searchable timeline of everything the engine has done."
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search messages, codes…"
          className="pl-9"
        />
        {isFetching && !isLoading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {isLoading ? (
        <Card className="p-4">
          <div className="space-y-1 divide-y divide-border/60">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex gap-3 py-3">
                <Skeleton className="mt-1 size-2 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </Card>
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={search ? "No matching events" : "No activity yet"}
          description={
            search
              ? `Nothing matches "${search}".`
              : "As DriveHub syncs, every action will be logged here."
          }
        />
      ) : (
        <Card className="px-4">
          <div className="max-h-[calc(100vh-18rem)] divide-y divide-border/60 overflow-y-auto">
            {data.map((e) => (
              <ActivityItem key={e.id} event={e} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
