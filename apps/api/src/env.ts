// Loads .env.local (then .env) from the app root, mirroring the env-loading
// order the code relied on when it lived inside Next.js. Import this before
// anything that reads process.env (Prisma, the Stellar config).

import { config } from "dotenv";
import path from "node:path";

const root = process.cwd();
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });
