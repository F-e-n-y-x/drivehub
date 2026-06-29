import { useEffect, useState } from "react";
import { Download, FileQuestion, Loader2 } from "lucide-react";
import type { RemoteEntry } from "@drivehub/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { fileUrl } from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";

/** Files larger than this are not fetched for text preview. */
const TEXT_PREVIEW_LIMIT = 1024 * 1024; // ~1 MB

type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none";

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "log",
  "yml",
  "yaml",
  "toml",
  "ini",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
  "scss",
  "html",
  "htm",
  "xml",
  "svg",
  "sh",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "cs",
  "php",
  "sql",
  "env",
  "conf",
]);

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Decide how to preview an entry from its mime type, then its extension. */
function previewKind(entry: RemoteEntry): PreviewKind {
  const mime = entry.mimeType ?? "";
  const ext = extOf(entry.name);
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext))
    return "image";
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v", "ogv"].includes(ext))
    return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "oga", "aac", "flac", "m4a"].includes(ext))
    return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXTS.has(ext))
    return "text";
  return "none";
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  remoteId,
  entry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remoteId: string;
  entry: RemoteEntry | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(56rem,92vw)] max-w-none flex-col gap-4 overflow-hidden">
        {entry && (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="truncate" title={entry.name}>
                {entry.name}
              </DialogTitle>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatBytes(entry.sizeBytes)}
                </span>
                <a
                  href={fileUrl(remoteId, entry.path, true)}
                  download={entry.name}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download className="size-4" />
                  Download
                </a>
              </div>
            </DialogHeader>
            <PreviewBody remoteId={remoteId} entry={entry} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  remoteId,
  entry,
}: {
  remoteId: string;
  entry: RemoteEntry;
}) {
  const kind = previewKind(entry);
  const src = fileUrl(remoteId, entry.path);
  const [errored, setErrored] = useState(false);

  // Reset error when the entry changes.
  useEffect(() => setErrored(false), [entry.path]);

  if (errored) return <PreviewMessage icon={FileQuestion} text="Couldn't load this file." />;

  const frame = "min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/30";

  if (kind === "image") {
    return (
      <div className={cn(frame, "flex items-center justify-center p-2")}>
        <img
          src={src}
          alt={entry.name}
          onError={() => setErrored(true)}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className={cn(frame, "flex items-center justify-center bg-black/80 p-2")}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={src} controls onError={() => setErrored(true)} className="max-h-full max-w-full">
          Your browser can't play this video.
        </video>
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-muted/30 p-8">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={src} controls onError={() => setErrored(true)} className="w-full max-w-md" />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <iframe
        src={src}
        title={entry.name}
        onError={() => setErrored(true)}
        className="min-h-0 flex-1 rounded-lg border border-border bg-white"
      />
    );
  }

  if (kind === "text") return <TextPreview entry={entry} src={src} />;

  return <PreviewMessage icon={FileQuestion} text="No preview available for this file type." />;
}

function TextPreview({ entry, src }: { entry: RemoteEntry; src: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "too-large" }
    | { status: "error" }
    | { status: "ready"; text: string }
  >({ status: "loading" });

  useEffect(() => {
    if (entry.sizeBytes > TEXT_PREVIEW_LIMIT) {
      setState({ status: "too-large" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((text) => {
        if (!cancelled) setState({ status: "ready", text });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [src, entry.sizeBytes]);

  if (state.status === "loading")
    return (
      <PreviewMessage icon={Loader2} iconClassName="animate-spin" text="Loading preview…" />
    );
  if (state.status === "too-large")
    return <PreviewMessage icon={FileQuestion} text="File too large to preview. Download it instead." />;
  if (state.status === "error")
    return <PreviewMessage icon={FileQuestion} text="Couldn't load this file." />;

  return (
    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-mono text-[13px] leading-relaxed text-foreground">
      {state.text}
    </pre>
  );
}

function PreviewMessage({
  icon: Icon,
  iconClassName,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  text: string;
}) {
  return (
    <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
      <Icon className={cn("size-8 text-muted-foreground/60", iconClassName)} />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
