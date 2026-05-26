import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";
export { Prisma } from "./generated/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const poolMax = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 2,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
