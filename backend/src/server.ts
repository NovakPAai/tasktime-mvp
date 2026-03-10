import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`TaskTime API running on port ${config.PORT} [${config.NODE_ENV}]`);
});
