// Loads .env.local (then .env) for standalone scripts, mirroring Next.js's
// env-loading order. Import this before anything from src/lib/stellar.

import { config } from "dotenv";
import path from "node:path";

const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });
