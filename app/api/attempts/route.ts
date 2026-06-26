import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { attempts } from "@/db/schema";

/**
 * GET /api/attempts?status=&sort=
 * Returns the current user's attempt history, most recent first.
 * Optional filters: status=pending|completed|skipped|abandoned
 * Optional sort: sort=date|stars|difficulty|name
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  const conditions = [eq(attempts.userId, session.user.id)];
  if (statusFilter) conditions.push(eq(attempts.status, statusFilter));

  const rows = await db.query.attempts.findMany({
    where: and(...conditions),
    with: { level: true },
    orderBy: [desc(attempts.spunAt)],
  });

  return NextResponse.json({ attempts: rows });
}

const updateSchema = z.object({
  attemptId:    z.string(),
  status:       z.enum(["completed", "skipped", "abandoned"]).optional(),
  progressNote: z.string().max(2000).optional(),
  bestPercent:  z.number().int().min(0).max(100).optional(),
  attemptCount: z.number().int().min(0).optional(),
  timeSpentMin: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/attempts
 * Update progress or resolve an attempt.
 * Any combination of fields can be patched — you can save a note
 * without resolving, or resolve without updating stats.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { attemptId, status, progressNote, bestPercent, attemptCount, timeSpentMin } = parsed.data;

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.user.id)))
    .limit(1);

  if (!attempt)
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  const updates: Partial<typeof attempt> = {
    updatedAt: new Date(),
  };
  if (status !== undefined) {
    updates.status = status;
    updates.resolvedAt = new Date(); // status is never "pending" per zod enum
  }
  if (progressNote !== undefined) updates.progressNote = progressNote;
  if (bestPercent  !== undefined) updates.bestPercent  = bestPercent;
  if (attemptCount !== undefined) updates.attemptCount = attemptCount;
  if (timeSpentMin !== undefined) updates.timeSpentMin = timeSpentMin;

  await db.update(attempts).set(updates).where(eq(attempts.id, attemptId));

  const updated = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { level: true },
  });

  return NextResponse.json({ attempt: updated });
}
