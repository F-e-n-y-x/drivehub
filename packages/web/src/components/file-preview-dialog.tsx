import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileQuestion,
  Loader2,
  Minus,
  Plus,
  WrapText,
  X,
} from "lucide-react";
import type { RemoteEntry } from "@drivehub/types";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { fileUrl } from "@/lib/api";
import { entryIcon } from "@/lib/file-icons";
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
  if (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(
      ext,
    )
  )
    return "image";
  if (
    mime.startsWith("video/") ||
    ["mp4", "webm", "mov", "m4v", "ogv"].includes(ext)
  )
    return "video";
  if (
    mime.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "oga", "aac", "flac", "m4a"].includes(ext)
  )
    return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    TEXT_EXTS.has(ext)
  )
    return "text";
  return "none";
}

/**
 * Near-fullscreen file lightbox (Quick Look / Drive style). Optionally receives
 * the current folder's sibling *files* (`siblings`) and the index of the open
 * one (`index`) so it can page through them with on-screen chevrons and the
 * arrow keys. When no siblings are given it falls back to single-file mode.
 */
export function FilePreviewDialog({
  open,
  onOpenChange,
  remoteId,
  entry,
  siblings,
  index,
  onNavigate,
  urlFor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remoteId: string;
  entry: RemoteEntry | null;
  /** Sibling files (folders excluded) for prev/next navigation. */
  siblings?: RemoteEntry[];
  /** Index of the open entry within `siblings`. */
  index?: number;
  /** Called to switch to another sibling by index. */
  onNavigate?: (nextIndex: number) => void;
  /**
   * Overrides how a streaming/download URL is built for an entry. Defaults to
   * the per-remote `fileUrl`; the synthetic "Local files" source passes
   * `fsFileUrl` so it streams from `/api/fs/file` instead.
   */
  urlFor?: (entry: RemoteEntry, download?: boolean) => string;
}) {
  const buildUrl = urlFor ?? ((e: RemoteEntry, download?: boolean) =>
    fileUrl(remoteId, e.path, download));
  const list = siblings ?? (entry ? [entry] : []);
  const current =
    typeof index === "number" && index >= 0 && index < list.length
      ? index
      : 0;
  const hasNav = !!onNavigate && list.length > 1;

  const goPrev = useCallback(() => {
    if (!hasNav) return;
    onNavigate!((current - 1 + list.length) % list.length);
  }, [hasNav, onNavigate, current, list.length]);

  const goNext = useCallback(() => {
    if (!hasNav) return;
    onNavigate!((current + 1) % list.length);
  }, [hasNav, onNavigate, current, list.length]);

  // Arrow-key navigation while the lightbox is open.
  useEffect(() => {
    if (!open || !hasNav) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Don't hijack arrows while typing in a field (e.g. a future search box).
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hasNav, goPrev, goNext]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onClick={(e) => {
            // Click on the padding around the surface (the content element
            // itself, not its children) closes — Quick Look behavior.
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 focus:outline-none"
        >
          {entry && (
            <div className="flex h-[92vh] max-h-[92vh] w-[92vw] max-w-[92rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
              <DialogPrimitive.Title className="sr-only">
                {entry.name}
              </DialogPrimitive.Title>

              {/* Header bar */}
              <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 py-2.5">
                <HeaderIcon entry={entry} />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium text-foreground"
                    title={entry.name}
                  >
                    {entry.name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatBytes(entry.sizeBytes)}
                    {hasNav && (
                      <span className="ml-2">
                        {current + 1} of {list.length}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <SimpleTooltip label="Open raw in new tab">
                    <a
                      href={buildUrl(entry)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={buttonVariants({
                        variant: "outline",
                        size: "icon-sm",
                      })}
                      aria-label="Open raw in new tab"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </SimpleTooltip>
                  <a
                    href={buildUrl(entry, true)}
                    download={entry.name}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <Download className="size-4" />
                    Download
                  </a>
                  <DialogPrimitive.Close
                    className={buttonVariants({
                      variant: "ghost",
                      size: "icon-sm",
                    })}
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </DialogPrimitive.Close>
                </div>
              </div>

              {/* Center stage */}
              <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
                {/* `key` forces a clean remount per entry so each preview gets
                    fresh zoom/scroll/error state. */}
                <PreviewStage key={entry.path} entry={entry} buildUrl={buildUrl} />

                {hasNav && (
                  <>
                    <NavButton side="left" onClick={goPrev} />
                    <NavButton side="right" onClick={goNext} />
                  </>
                )}
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function HeaderIcon({ entry }: { entry: RemoteEntry }) {
  const Icon = entryIcon(entry.name, false, entry.mimeType);
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
      <Icon className="size-4 text-muted-foreground" />
    </span>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous file" : "Next file"}
      className={cn(
        "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/80 text-foreground shadow-md backdrop-blur transition-colors hover:bg-card",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}

function PreviewStage({
  entry,
  buildUrl,
}: {
  entry: RemoteEntry;
  buildUrl: (entry: RemoteEntry, download?: boolean) => string;
}) {
  const kind = previewKind(entry);
  const src = buildUrl(entry);
  const [errored, setErrored] = useState(false);

  if (errored)
    return <StageMessage icon={FileQuestion} text="Couldn't load this file." />;

  if (kind === "image")
    return <ImageStage src={src} alt={entry.name} onError={() => setErrored(true)} />;

  if (kind === "video")
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={src}
          controls
          autoPlay
          onError={() => setErrored(true)}
          className="max-h-full max-w-full"
        >
          Your browser can't play this video.
        </video>
      </div>
    );

  if (kind === "audio")
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
        <HeaderIcon entry={entry} />
        <p
          className="max-w-md truncate text-sm font-medium text-foreground"
          title={entry.name}
        >
          {entry.name}
        </p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          src={src}
          controls
          autoPlay
          onError={() => setErrored(true)}
          className="w-full max-w-md"
        />
      </div>
    );

  if (kind === "pdf")
    return (
      <iframe
        src={src}
        title={entry.name}
        onError={() => setErrored(true)}
        className="h-full w-full border-0 bg-white"
      />
    );

  if (kind === "text")
    return (
      <TextStage
        entry={entry}
        src={src}
        downloadHref={buildUrl(entry, true)}
      />
    );

  return (
    <StageMessage
      icon={FileQuestion}
      text="No preview available for this file type."
      downloadHref={buildUrl(entry, true)}
      downloadName={entry.name}
    />
  );
}

// --- Image stage: zoom + pan -------------------------------------------------

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function ImageStage({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const zoomBy = (delta: number) => {
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 0.4 : -0.4);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragging.current) {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      dragging.current = null;
    }
  };

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/40"
      style={{
        backgroundImage:
          "repeating-conic-gradient(hsl(var(--muted-foreground) / 0.1) 0% 25%, transparent 0% 50%)",
        backgroundSize: "24px 24px",
      }}
      onWheel={onWheel}
    >
      {loading && (
        <Loader2 className="absolute size-7 animate-spin text-muted-foreground" />
      )}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setLoading(false)}
        onError={onError}
        onDoubleClick={() => (zoom === 1 ? setZoom(2) : reset())}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="max-h-full max-w-full select-none object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          cursor: zoom > 1 ? (dragging.current ? "grabbing" : "grab") : "zoom-in",
          transition: dragging.current ? "none" : "transform 120ms ease-out",
        }}
      />

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/90 px-1.5 py-1 shadow-md backdrop-blur">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomBy(-0.4)}
        >
          <Minus className="size-4" />
        </Button>
        <button
          type="button"
          onClick={reset}
          className="min-w-[3rem] rounded px-1 text-xs font-medium tabular-nums text-muted-foreground hover:text-foreground"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomBy(0.4)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// --- Text stage --------------------------------------------------------------

function TextStage({
  entry,
  src,
  downloadHref,
}: {
  entry: RemoteEntry;
  src: string;
  downloadHref: string;
}) {
  const [wrap, setWrap] = useState(true);
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
      <StageMessage icon={Loader2} iconClassName="animate-spin" text="Loading preview…" />
    );
  if (state.status === "too-large")
    return (
      <StageMessage
        icon={FileQuestion}
        text="Too large to preview."
        downloadHref={downloadHref}
        downloadName={entry.name}
      />
    );
  if (state.status === "error")
    return <StageMessage icon={FileQuestion} text="Couldn't load this file." />;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center justify-end border-b border-border bg-card/60 px-3 py-1.5">
        <Button
          variant={wrap ? "accent" : "outline"}
          size="sm"
          onClick={() => setWrap((w) => !w)}
        >
          <WrapText className="size-4" />
          Wrap
        </Button>
      </div>
      <pre
        className={cn(
          "min-h-0 flex-1 overflow-auto bg-card p-4 font-mono text-[13px] leading-relaxed text-foreground",
          wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
        )}
      >
        {state.text}
      </pre>
    </div>
  );
}

// --- Shared message / fallback ----------------------------------------------

function StageMessage({
  icon: Icon,
  iconClassName,
  text,
  downloadHref,
  downloadName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  text: string;
  /** When set, shows a Download button pointing here. */
  downloadHref?: string;
  downloadName?: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Icon className={cn("size-12 text-muted-foreground/50", iconClassName)} />
      <p className="text-sm text-muted-foreground">{text}</p>
      {downloadHref && (
        <a
          href={downloadHref}
          download={downloadName}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="size-4" />
          Download
        </a>
      )}
    </div>
  );
}
