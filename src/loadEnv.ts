import dotenv from 'dotenv';

// Base env — main / production values (.env).
dotenv.config();

// Local dev overrides — .env.local is layered on top and wins where keys overlap.
// It is gitignored and only exists in local checkouts; on the server each deploy
// folder has its own .env, so this call is a harmless no-op there.
dotenv.config({ path: '.env.local', override: true });

// Dev-mode value selection:
//   NODE_ENV === 'production'  -> base (MAIN) values stay as-is.
//   otherwise (development)    -> every DEV_* key overrides its base key, e.g.
//   process.env.MONGO_URL becomes DEV_MONGO_URL. One .env holds both; NODE_ENV picks.
if (process.env.NODE_ENV !== 'production') {
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith('DEV_')) continue;
    const baseKey = key.slice(4);
    const val = process.env[key];
    if (baseKey && val !== undefined) process.env[baseKey] = val;
  }
}
