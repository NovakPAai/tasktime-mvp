import { createApp } from './app.js';
import { config } from './config.js';
import {
  startCheckpointScheduler,
  stopCheckpointScheduler,
} from './modules/releases/checkpoints/checkpoint-scheduler.service.js';
import {
  startBulkOperationsScheduler,
  stopBulkOperationsScheduler,
} from './modules/bulk-operations/bulk-operations.processor.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  console.log(`Flow Universe API running on port ${config.PORT} [${config.NODE_ENV}]`);
  startCheckpointScheduler();
  startBulkOperationsScheduler();
});

async function shutdown(signal: string) {
  console.log(`[${signal}] shutting down…`);
  // Drain in-flight scheduler ticks before closing HTTP — writes must complete.
  await Promise.allSettled([stopCheckpointScheduler(), stopBulkOperationsScheduler()]);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
