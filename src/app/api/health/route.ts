import { NextResponse } from "next/server";

/**
 * Liveness check for EasyPanel (or any container orchestrator). Deliberately
 * does not touch the database — a health check that depends on an external
 * service can flap the container on a transient DB blip that the app itself
 * would have recovered from. Prisma's own connection handling surfaces DB
 * outages through normal request errors instead.
 */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
