import { config } from './config.js';
import { createApp } from './app.js';
import { runSyncSafe } from './modules/sync/sync.service.js';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`Pipeline Service running on port ${config.PORT} [${config.NODE_ENV}]`);

  // Start GitHub polling loop
  const hasValidRepo = config.APP_GITHUB_REPOS
    .split(',')
    .map(r => r.trim())
    .some(r => /^[^/\s]+\/[^/\s]+$/.test(r));

  if (hasValidRepo) {
    const intervalMs = config.SYNC_INTERVAL_SEC * 1000;
    console.log(`GitHub polling every ${config.SYNC_INTERVAL_SEC}s for: ${config.APP_GITHUB_REPOS}`);

    // First sync on startup (after 3s to let DB settle)
    setTimeout(async () => {
      const result = await runSyncSafe();
      console.log('[sync]', result);
    }, 3000);

    setInterval(async () => {
      const result = await runSyncSafe();
      console.log('[sync]', result);
    }, intervalMs);
  }
});
