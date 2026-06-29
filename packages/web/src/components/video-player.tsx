import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** mm:ss (or h:mm:ss for long media) with stable width for tabular-nums. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const IDLE_MS = 2500;

/**
 * Custom video player matching the DriveHub design system. Keeps a native
 * `<video>` under the hood (so HTTP Range streaming still works) but hides the
 * native chrome and renders its own overlay controls: play/pause, scrubber with
 * buffered range, time, volume, and fullscreen. Keyboard shortcuts are scoped
 * to the player (only fire when focused/hovered) so they don't hijack the
 * dialog's global ← / → navigation.
 */
export function VideoPlayer({
  src,
  className,
  autoPlay = true,
}: {
  src: string;
  className?: string;
  autoPlay?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleTimer = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [errored, setErrored] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  /** Whether the pointer is currently over the player. */
  const [hovered, setHovered] = useState(false);

  // --- Activity / auto-hide -------------------------------------------------
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      // Only hide while actively playing and not interacting.
      const v = videoRef.current;
      if (v && !v.paused && !scrubbing) setControlsVisible(false);
    }, IDLE_MS);
  }, [scrubbing]);

  useEffect(() => {
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  // --- Video element bindings ----------------------------------------------
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(
      v.duration,
      Math.max(0, v.currentTime + delta),
    );
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    // Un-muting at zero volume bumps to a sensible level.
    if (!v.muted && v.volume === 0) {
      v.volume = 0.5;
      setVolume(0.5);
    }
  }, []);

  const setVolumeValue = useCallback((value: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.min(1, Math.max(0, value));
    v.volume = clamped;
    v.muted = clamped === 0;
    setVolume(clamped);
    setMuted(clamped === 0);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // --- Scrubbing ------------------------------------------------------------
  const seekToFraction = useCallback((fraction: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(1, Math.max(0, fraction)) * v.duration;
  }, []);

  const onScrubPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = e.currentTarget;
    track.setPointerCapture(e.pointerId);
    setScrubbing(true);
    const apply = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      seekToFraction((clientX - rect.left) / rect.width);
    };
    apply(e.clientX);
  };

  const onScrubPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekToFraction((e.clientX - rect.left) / rect.width);
  };

  const onScrubPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setScrubbing(false);
    showControls();
  };

  // --- Keyboard (scoped to the player) -------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault();
        e.stopPropagation();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        e.stopPropagation();
        seekBy(-5);
        showControls();
        break;
      case "ArrowRight":
        e.preventDefault();
        e.stopPropagation();
        seekBy(5);
        showControls();
        break;
      case "f":
      case "F":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "m":
      case "M":
        e.preventDefault();
        toggleMute();
        break;
      default:
        return;
    }
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={showControls}
      onMouseEnter={() => {
        setHovered(true);
        showControls();
      }}
      onMouseLeave={() => {
        setHovered(false);
        const v = videoRef.current;
        if (v && !v.paused && !scrubbing) setControlsVisible(false);
      }}
      className={cn(
        "group/player relative flex h-full w-full items-center justify-center overflow-hidden bg-black outline-none",
        className,
      )}
      style={{
        cursor: controlsVisible || !playing ? "default" : "none",
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        controls={false}
        playsInline
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true);
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length > 0) {
            setBuffered(v.buffered.end(v.buffered.length - 1));
          }
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onError={() => setErrored(true)}
        className="max-h-full max-w-full"
      />

      {/* Buffering spinner */}
      {waiting && !errored && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-10 animate-spin text-white/90 drop-shadow" />
        </div>
      )}

      {/* In-player error state */}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-8 text-center">
          <AlertCircle className="size-10 text-muted-foreground/70" />
          <p className="text-sm text-white/80">Couldn&apos;t play this file.</p>
        </div>
      )}

      {/* Big center play affordance when paused */}
      {!playing && !errored && !waiting && (
        <button
          type="button"
          aria-label="Play"
          onClick={togglePlay}
          className="absolute z-10 flex size-16 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur transition-all duration-150 hover:scale-105 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <Play className="size-7 translate-x-0.5 fill-current" />
        </button>
      )}

      {/* Controls bar */}
      {!errored && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-200",
            controlsVisible || hovered || !playing
              ? "opacity-100"
              : "pointer-events-none opacity-0",
          )}
        >
          {/* Scrubber */}
          <div
            role="slider"
            tabIndex={-1}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration) || 0}
            aria-valuenow={Math.floor(current)}
            onPointerDown={onScrubPointerDown}
            onPointerMove={onScrubPointerMove}
            onPointerUp={onScrubPointerUp}
            className="group/scrub relative flex h-4 cursor-pointer touch-none items-center"
          >
            {/* Track */}
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25">
              {/* Buffered */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/35"
                style={{ width: `${bufferedPct}%` }}
              />
              {/* Played (accent fill) */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Thumb */}
            <div
              className={cn(
                "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow ring-2 ring-white/70 transition-opacity",
                scrubbing
                  ? "opacity-100"
                  : "opacity-0 group-hover/scrub:opacity-100",
              )}
              style={{ left: `${pct}%` }}
            />
          </div>

          {/* Bottom row */}
          <div className="mt-1 flex items-center gap-1.5 text-white">
            <ControlButton
              label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
            >
              {playing ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
            </ControlButton>

            {/* Volume */}
            <div className="group/vol flex items-center">
              <ControlButton
                label={muted || volume === 0 ? "Unmute" : "Mute"}
                onClick={toggleMute}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </ControlButton>
              <div className="flex w-0 items-center overflow-hidden opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:pl-1.5 group-hover/vol:opacity-100 focus-within:w-20 focus-within:pl-1.5 focus-within:opacity-100">
                <VolumeSlider
                  value={muted ? 0 : volume}
                  onChange={setVolumeValue}
                />
              </div>
            </div>

            <div className="ml-1 select-none text-xs tabular-nums text-white/90">
              {formatTime(current)}
              <span className="text-white/45"> / {formatTime(duration)}</span>
            </div>

            <div className="flex-1" />

            <ControlButton
              label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
            >
              {fullscreen ? (
                <Minimize className="size-4" />
              ) : (
                <Maximize className="size-4" />
              )}
            </ControlButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** A small ghost-style control button tuned for the dark overlay. */
function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex size-8 items-center justify-center rounded-md text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}

/** Thin accent-filled volume slider, matching the scrubber styling. */
function VolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const apply = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    onChange((clientX - rect.left) / rect.width);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        apply(e.clientX, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (dragging) apply(e.clientX, e.currentTarget);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        setDragging(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onChange(Math.max(0, value - 0.05));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onChange(Math.min(1, value + 0.05));
        }
      }}
      className="group/vs relative flex h-4 w-full cursor-pointer touch-none items-center outline-none"
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <div
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow ring-2 ring-white/70 opacity-0 transition-opacity group-hover/vs:opacity-100 group-focus/vs:opacity-100"
        style={{ left: `${value * 100}%` }}
      />
    </div>
  );
}
