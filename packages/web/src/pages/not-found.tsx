import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-card">
        <Compass className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">Error 404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link to="/" className={buttonVariants({ variant: "accent", className: "mt-6" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
