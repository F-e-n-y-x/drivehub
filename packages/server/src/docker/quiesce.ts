import { existsSync } from "node:fs";
import http from "node:http";
import type { Logger } from "../logger.js";

const SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";

interface DockerResponse {
  status: number;
  body: string;
}

function dockerRequest(method: string, urlPath: string): Promise<DockerResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: SOCKET, path: urlPath, method, timeout: 15000 },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("docker socket timeout")));
    req.end();
  });
}

/**
 * Pause/unpause Docker containers around a snapshot so their databases are
 * archived in a consistent state. Requires the Docker socket mounted into the
 * container; degrades gracefully (logs a warning) when it isn't available.
 */
export class ContainerQuiescer {
  constructor(private readonly logger: Logger) {}

  available(): boolean {
    return existsSync(SOCKET);
  }

  async pause(names: string[]): Promise<string[]> {
    return this.act("pause", names);
  }

  async unpause(names: string[]): Promise<string[]> {
    return this.act("unpause", names);
  }

  private async act(action: "pause" | "unpause", names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    if (!this.available()) {
      this.logger.warn(
        { action },
        "container quiesce requested but Docker socket is not mounted; skipping",
      );
      return [];
    }
    const done: string[] = [];
    for (const name of names) {
      try {
        const res = await dockerRequest("POST", `/containers/${encodeURIComponent(name)}/${action}`);
        // 204 = success, 304 = already in that state — both fine.
        if (res.status === 204 || res.status === 304) {
          done.push(name);
        } else {
          this.logger.warn({ name, action, status: res.status }, "container quiesce non-success");
        }
      } catch (e) {
        this.logger.error({ name, action, err: String(e) }, "container quiesce failed");
      }
    }
    return done;
  }
}
