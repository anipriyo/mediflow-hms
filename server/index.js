import { initDb, db } from './db/connection.js';
import { seedDatabase } from './db/seed.js';
import { createApp } from './app.js';
import { config } from './config.js';

const reset = process.env.RESET_DB === '1';
initDb(config.dbPath, { reset });
const empty = db().prepare('SELECT COUNT(*) n FROM users').get().n === 0;
if (empty) {
  console.log('[mediflow] Empty database – loading demo data…');
  seedDatabase();
}

const app = createApp({ serveClient: true });
app.listen(config.port, () => {
  console.log(`[mediflow] API running on http://localhost:${config.port}/api  (db: ${config.dbPath})`);
  console.log('[mediflow] Demo logins (password Mediflow@123): admin, reception, dr.sharma, lab, pharmacy, billing');
});
