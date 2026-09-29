import { prisma } from "@/lib/db";

// Render calls this to check the service is up. It also checks the database is reachable,
// so a bad DATABASE_URL shows up as an unhealthy deploy rather than a broken app.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
