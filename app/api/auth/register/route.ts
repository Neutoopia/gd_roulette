import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name:     z.string().min(1).max(60).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { email, password, name } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing)
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const id = createId();

  await db.insert(users).values({ id, email, passwordHash, name });

  return NextResponse.json({ id, email, name }, { status: 201 });
}
