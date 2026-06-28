import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dbError, serverError } from "@/lib/api-error";

const schema = z.object({
  email:    z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name:     z.string().min(1).max(60).optional(),
});

export async function POST(req: Request) {
  // 1. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  // 2. Validate input
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message).join(" ");
    return NextResponse.json({ error: messages }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  // 3. Check for duplicate email
  let existing;
  try {
    [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  } catch (err) {
    return dbError("register/check-duplicate", err);
  }
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  // 4. Hash password and insert
  let passwordHash: string;
  try {
    passwordHash = await bcrypt.hash(password, 12);
  } catch (err) {
    return serverError("register/bcrypt", err);
  }

  try {
    const id = createId();
    await db.insert(users).values({ id, email, passwordHash, name });
    return NextResponse.json({ id, email, name }, { status: 201 });
  } catch (err) {
    return dbError("register/insert", err);
  }
}
