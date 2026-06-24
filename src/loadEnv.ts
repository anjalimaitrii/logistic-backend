import dotenv from 'dotenv';

// Base env — main / production values (.env).
dotenv.config();

// Local dev overrides — .env.local is layered on top and wins where keys overlap.
// It is gitignored and only exists in local checkouts; on the server each deploy
// folder has its own .env, so this call is a harmless no-op there.
dotenv.config({ path: '.env.local', override: true });
