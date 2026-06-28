import * as React from "react";
import { create } from "zustand";
import { CheckCircle2, AlertCircle, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "error" | "warning";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => number;
  dismiss: (id: number) => void;
}

let counter = 0;

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

interface ToastOptions {
  description?: string;
  duration?: number;
}

function emit(variant: ToastVariant, title: string, opts?: ToastOptions) {
  return useToastStore.getState().push({
    title,
    description: opts?.description,
    variant,
    duration: opts?.duration ?? 4000,
  });
}

export const toast = Object.assign(
  (title: string, opts?: ToastOptions) => emit("default", title, opts),
  {
    success: (title: string, opts?: ToastOptions) =>
      emit("success", title, opts),
    error: (title: string, opts?: ToastOptions) => emit("error", title, opts),
    warning: (title: string, opts?: ToastOptions) =>
      emit("warning", title, opts),
  },
);

const icons: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="size-4 text-muted-foreground" />,
  success: <CheckCircle2 className="size-4 text-synced" />,
  error: <XCircle className="size-4 text-danger" />,
  warning: <AlertCircle className="size-4 text-pending" />,
};

function ToastRow({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);

  React.useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), item.duration);
    return () => clearTimeout(t);
  }, [item.id, item.duration, dismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border bg-popover px-4 py-3 shadow-lg",
        "data-[dh-content]:animate-in",
      )}
      style={{ animation: "dh-toast-in 200ms cubic-bezier(0.16,1,0.3,1)" }}
    >
      <span className="mt-0.5 shrink-0">{icons[item.variant]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-[13px] text-muted-foreground leading-snug">
            {item.description}
          </p>
        )}
      </div>
      <button
        onClick={() => dismiss(item.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4">
      {toasts.map((t) => (
        <ToastRow key={t.id} item={t} />
      ))}
    </div>
  );
}
