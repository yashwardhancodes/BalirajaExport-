import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL. Set it in .env.local (see .env.example), then restart `npm run dev`.");
}

// Reuse one client across hot reloads in dev, otherwise every edit opens a new connection pool.
// But after `prisma generate` (e.g. a new model) the PrismaClient class itself changes, and a client
// built from the old class wouldn't know the new models — so only reuse it if the class is the same.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClass?: typeof PrismaClient;
};

function createClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function devClient(): PrismaClient {
  if (globalForPrisma.prisma && globalForPrisma.prismaClass === PrismaClient) return globalForPrisma.prisma;
  void globalForPrisma.prisma?.$disconnect().catch(() => {}); // close the stale client's pool
  globalForPrisma.prisma = createClient();
  globalForPrisma.prismaClass = PrismaClient;
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = process.env.NODE_ENV === "production" ? createClient() : devClient();

/** What a Prisma row looks like once it reaches the browser: Decimal -> number, Date -> ISO string. */
export type Plain<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

/**
 * Server actions can't send Decimal objects to client components, and the calc engine works in numbers.
 * Values are money/weights with ≤4 decimals, well within a double's exact range.
 */
export function toPlain<T>(value: T): Plain<T> {
  if (value === null || value === undefined) return value as Plain<T>;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber() as Plain<T>;
  if (value instanceof Date) return value.toISOString() as Plain<T>;
  if (Array.isArray(value)) return value.map(toPlain) as Plain<T>;
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)])) as Plain<T>;
  }
  return value as Plain<T>;
}
