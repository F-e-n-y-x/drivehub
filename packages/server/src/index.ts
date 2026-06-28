import { mkdirSync } from "node:fs";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { SyncEngine } from "./engine/engine.js";
import { buildServer } from "./http/server.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Ensure the mounted directories exist.
  mkdirSync(config.HUB_PATH, { recursive: true });
  mkdirSync(config.DATA_DIR, { recursive: true });

  const { db, close } = openDatabase(config.DATA_DIR);
  const engine = new SyncEngine(config, db, logger);
  const app = buildServer(config, engine, logger);

  await engine.start();
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`DriveHub listening on ${config.PUBLIC_URL}`);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    try {
      await engine.stop();
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
