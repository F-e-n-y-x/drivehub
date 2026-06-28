import { useAccounts } from "@/hooks/queries";
import { FirstRunWizard } from "@/pages/first-run-wizard";
import { Loader2 } from "lucide-react";

/**
 * If no Google accounts are connected yet, show the onboarding wizard instead
 * of dropping the user onto an empty dashboard.
 */
export function FirstRunGate({ children }: { children: React.ReactNode }) {
  const { data: accounts, isLoading, isError } = useAccounts();

  // While we don't yet know, show a quiet full-screen loader (not a raw page).
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // On error (e.g. backend not up) fall through to the app, which renders its
  // own error/empty states gracefully.
  if (!isError && accounts && accounts.length === 0) {
    return <FirstRunWizard />;
  }

  return <>{children}</>;
}
