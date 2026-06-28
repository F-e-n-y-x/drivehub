import { Plus, Users } from "lucide-react";
import { useAccounts } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { AccountCard } from "@/components/account-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";

function connectGoogle() {
  window.location.href = "/api/auth/google/start";
}

export function AccountsPage() {
  const { data: accounts, isLoading, isError, refetch } = useAccounts();

  return (
    <div className="space-y-7">
      <PageHeader
        title="Accounts"
        description="Connect and manage the Google accounts DriveHub syncs with."
        actions={
          <Button variant="accent" onClick={connectGoogle}>
            <Plus className="size-4" />
            Connect Google Account
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : accounts && accounts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="No accounts connected"
          description="Connect your first Google account to begin syncing your Drive with the local hub folder."
          action={
            <Button variant="accent" onClick={connectGoogle}>
              <Plus className="size-4" />
              Connect Google Account
            </Button>
          }
        />
      )}
    </div>
  );
}
