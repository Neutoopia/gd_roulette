import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { attempts } from "@/db/schema";
import { dbError } from "@/lib/api-error";

const VALID_STATUSES = new Set(["pending", "completed", "skipped", "abandoned"]);

export async function GET(req: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // 2. Validate status filter param
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
    return NextResponse.json(
      { error: `Invalid status filter. Must be one of: ${[...VALID_STATUSES].join(", ")}.` },
      { status: 400 }
    );
  }

  // 3. Fetch
  try {
    const conditions = [eq(attempts.userId, session.user.id)];
    if (statusFilter) conditions.push(eq(attempts.status, statusFilter));

    const rows = await db.query.attempts.findMany({
      where: and(...conditions),
      with: { level: true },
      orderBy: [desc(attempts.spunAt)],
    });

    return NextResponse.json({ attempts: rows });
  } catch (err) {
    return dbError("attempts/GET", err);
  }
}

const updateSchema = z.object({
  attemptId:    z.string().min(1, "attemptId is required."),
  status:       z.enum(["completed", "skipped", "abandoned"]).optional(),
  progressNote: z.string().max(2000, "Notes cannot exceed 2000 characters.").optional(),
  bestPercent:  z.number().int().min(0).max(100, "Best % must be between 0 and 100.").optional(),
  attemptCount: z.number().int().min(0, "Attempt count cannot be negative.").optional(),
  timeSpentMin: z.number().int().min(0, "Time spent cannot be negative.").optional(),
});

export async function PATCH(req: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  // 3. Validate
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message).join(" ");
    return NextResponse.json({ error: messages }, { status: 400 });
  }

  const { attemptId, status, progressNote, bestPercent, attemptCount, timeSpentMin } = parsed.data;

  // 4. Check at least one field is being updated
  if (!status && progressNote === undefined && bestPercent === undefined && attemptCount === undefined && timeSpentMin === undefined) {
    return NextResponse.json(
      { error: "No fields to update. Provide at least one of: status, progressNote, bestPercent, attemptCount, timeSpentMin." },
      { status: 400 }
    );
  }

  // 5. Fetch the attempt and verify ownership
  let attempt;
  try {
    [attempt] = await db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, session.user.id)))
      .limit(1);
  } catch (err) {
    return dbError("attempts/PATCH/fetch", err);
  }

  if (!attempt)
    return NextResponse.json(
      { error: "Attempt not found or does not belong to your account." },
      { status: 404 }
    );

  // 6. Guard against resolving an already-resolved attempt
  if (status && attempt.status !== "pending") {
    return NextResponse.json(
      { error: `This attempt is already marked as "${attempt.status}" and cannot be changed.` },
      { status: 409 }
    );
  }

  // 7. Build update payload
  const updates: Partial<typeof attempt> = { updatedAt: new Date() };
  if (status !== undefined) {
    updates.status     = status;
    updates.resolvedAt = new Date();
  }
  if (progressNote !== undefined) updates.progressNote = progressNote;
  if (bestPercent  !== undefined) updates.bestPercent  = bestPercent;
  if (attemptCount !== undefined) updates.attemptCount = attemptCount;
  if (timeSpentMin !== undefined) updates.timeSpentMin = timeSpentMin;

  // 8. Persist and return
  try {
    await db.update(attempts).set(updates).where(eq(attempts.id, attemptId));

    const updated = await db.query.attempts.findFirst({
      where: eq(attempts.id, attemptId),
      with: { level: true },
    });

    return NextResponse.json({ attempt: updated });
  } catch (err) {
    return dbError("attempts/PATCH/update", err);
  }
}
