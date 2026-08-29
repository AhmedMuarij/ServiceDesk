import path from "node:path";
import { defineConfig, env } from "@prisma/config";

// Prisma 7 no longer auto-loads .env — Node does it. In CI and on Vercel the
// variables are already in the environment, so a missing file is not an error.
try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on the ambient environment
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need the unpooled endpoint: Neon's PgBouncer pooler runs in
    // transaction mode, which can't hold the advisory locks Migrate takes out
    // or run DDL reliably. The pooled DATABASE_URL is for the runtime client.
    url: env("DIRECT_URL"),
  },
});
