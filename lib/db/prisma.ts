import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * The raw client. Application code should not import this directly for tenant
 * data — go through the scoped accessors in lib/db/*.ts, which always put
 * organizationId in the where clause. See docs/03-data-model.md.
 *
 * Prisma 7 takes its connection through a driver adapter rather than a url in
 * the schema. This uses the pooled DATABASE_URL; migrations use DIRECT_URL via
 * prisma.config.ts.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

// Next.js hot-reloads modules in dev, which would otherwise open a new pool on
// every save until the database refuses connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
