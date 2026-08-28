import { processNewData } from './server.js';

processNewData()
  .then(() => {
    console.log('[Runner] Job completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Runner] Job failed:', error);
    process.exit(1);
  });
