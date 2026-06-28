import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QueryError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-danger/30 bg-danger/[0.03] px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangle className="size-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        Couldn't load this
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {message ?? "The server may be unavailable. Try again in a moment."}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw className="size-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
