import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { Orchestrator } from "./orchestrator.js";
import { buildServer } from "./http/server.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();

  mkdirSync(config.DATA_DIR, { recursive: true });
  mkdirSync(path.join(config.DATA_DIR, "tmp"), { recursive: true });
  mkdirSync(config.HUB_PATH, { recursive: true });

  const { db, close } = openDatabase(config.DATA_DIR);
  const orch = new Orchestrator(config, db, logger);
  const app = buildServer(config, orch, logger);

  await orch.start();
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`DriveHub listening on ${config.PUBLIC_URL}`);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    try {
      await orch.stop();
      await app.close();
      close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error(err, "fatal startup error");
  process.exit(1);
});
