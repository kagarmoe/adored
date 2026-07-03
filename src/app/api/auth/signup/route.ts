import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { generateId } from "@/lib/id";
import { getPostHogClient } from "@/lib/posthog-server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if user already exists
    const existing = await db
      .select()
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      // Equalize timing: run a throwaway hash so the dup-email path takes the
      // same wall-clock time as the real signup path (purses-zeyd timing oracle).
      await bcrypt.hash(password, 12);
      // Return generic success to prevent email enumeration.
      return NextResponse.json(
        { message: "Account created successfully" },
        { status: 201 }
      );
    }

    // Hash password with cost factor 12 (OWASP recommendation)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const newUserId = generateId("user");
    await db.insert(user).values({
      id: newUserId,
      email: normalizedEmail,
      name: normalizedEmail.split("@")[0],
      password: hashedPassword,
      emailVerified: new Date(),
    });

    const phClient = getPostHogClient();
    phClient.capture({
      distinctId: newUserId,
      event: 'user_signed_up',
    });
    await phClient.flush();

    return NextResponse.json(
      { message: "Account created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "An error occurred during signup" },
      { status: 500 }
    );
  }
}
