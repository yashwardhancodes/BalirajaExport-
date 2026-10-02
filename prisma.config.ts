import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Same env files Next.js reads; .env.local wins. On Vercel/Render there are no files and the
// variables come from the hosting dashboard instead.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

// Migrations need a session connection; the app's DATABASE_URL may be a transaction pooler
// (e.g. Supabase port 6543), which can't run them. Falls back to DATABASE_URL for plain Postgres.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

// `prisma generate` doesn't need a database, but migrate does: fail with a message that says what to fix.
if (!url && process.argv.includes("migrate")) {
  throw new Error(
    "DIRECT_URL and DATABASE_URL are not set, so migrations can't reach the database. " +
      "On Vercel: Project → Settings → Environment Variables → add both (for Production and Preview), then Redeploy. " +
      "Locally: add them to .env.local (see .env.example)."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
