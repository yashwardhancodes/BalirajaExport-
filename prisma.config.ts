import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Same env files Next.js reads; .env.local wins.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations need a session connection; the app's DATABASE_URL may be a transaction pooler
  // (e.g. Supabase port 6543), which can't run them. Falls back to DATABASE_URL for plain Postgres.
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
});
