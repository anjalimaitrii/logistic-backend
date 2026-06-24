import dotenv from 'dotenv';

// Base env — main / production values (.env).
dotenv.config();

// Local dev overrides — .env.local is layered on top and wins where keys overlap.
// It is gitignored and only exists in local checkouts; on the server each deploy
// folder has its own .env, so this call is a harmless no-op there.
dotenv.config({ path: '.env.local', override: true });

// Dev-mode (NODE_ENV !== 'production'). Prod me kuch nahi hota — wahan env mandatory.
if (process.env.NODE_ENV !== 'production') {
  // 1) DEV_* keys ko base key par overlay karo (e.g. DEV_MONGO_URL -> MONGO_URL).
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith('DEV_')) continue;
    const baseKey = key.slice(4);
    const val = process.env[key];
    if (baseKey && val !== undefined) process.env[baseKey] = val;
  }

  // 2) DEV-ONLY fallbacks — agar dev me var set hi nahi (e.g. server .env khaali),
  //    to ye defaults lag jaate hain taaki dev bina .env ke bhi chale.
  //    PROD me ye kabhi nahi lagte (upar wala guard).
  const devDefault = (key: string, value: string) => {
    if (!process.env[key]) process.env[key] = value;
  };
  devDefault('MONGO_URL', 'mongodb+srv://anjijangid8_db_user:X0loPw3mXi4g1Gf4@cluster0.qd97ie9.mongodb.net/fleet_dev');
  devDefault('JWT_SECRET', 'fleet_track_2026_DEV_key_123');
  devDefault('ADMIN_EMAIL', 'goyalpiyush7@gmail.com');
  devDefault('ADMIN_PASSWORD', 'Piyush@Goyal7');
  devDefault('ADMIN_NAME', 'Piyush Goyal');
  devDefault('ADMIN_EMAIL_2', 'casakshigoyal2@gmail.com');
  devDefault('ADMIN_PASSWORD_2', 'Sakshi@Goyal2');
  devDefault('ADMIN_NAME_2', 'Sakshi Goyal');
}
