import { env } from './env.js';
import { createApp } from './app.js';

createApp().listen(env.API_PORT, () => {
  console.log(`HarvestGo API listening on http://localhost:${env.API_PORT}`);
});
