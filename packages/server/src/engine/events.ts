import { EventEmitter } from "node:events";
import type { ServerEvent } from "@drivehub/types";

/**
 * A tiny typed pub/sub the engine uses to broadcast state changes. The HTTP
 * layer subscribes and forwards everything to connected browsers over SSE.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Many SSE clients + internal listeners; lift the default cap.
    this.emitter.setMaxListeners(100);
  }

  emit(event: ServerEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
