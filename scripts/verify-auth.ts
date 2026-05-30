import dotenv from "dotenv";

// Load environment variables from .env.local or .env.development.local
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

import { getDb } from "@/lib/db";
import { user, account, session, verificationToken } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { generateId } from "@/lib/id";

async function verifyAuthSetup() {
  console.log("🔍 Verifying Authentication Setup...\n");

  const db = getDb();
  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Database schema exists
  totalTests++;
  try {
    await db.select().from(user).limit(1);
    console.log("✅ Test 1: User table accessible");
    passedTests++;
  } catch (e) {
    console.log("❌ Test 1: User table not accessible:", (e as Error).message);
  }

  // Test 2: NextAuth tables exist
  totalTests++;
  try {
    await db.select().from(account).limit(1);
    await db.select().from(session).limit(1);
    await db.select().from(verificationToken).limit(1);
    console.log("✅ Test 2: NextAuth tables (account, session, verificationToken) accessible");
    passedTests++;
  } catch (e) {
    console.log("❌ Test 2: NextAuth tables not accessible:", (e as Error).message);
  }

  // Test 3: Password hashing works
  totalTests++;
  try {
    const testPassword = "testPassword123";
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    const isMatch = await bcrypt.compare(testPassword, hashedPassword);
    if (isMatch) {
      console.log("✅ Test 3: Password hashing (bcrypt) working correctly");
      passedTests++;
    } else {
      console.log("❌ Test 3: Password comparison failed");
    }
  } catch (e) {
    console.log("❌ Test 3: Password hashing failed:", (e as Error).message);
  }

  // Test 4: ID generation works
  totalTests++;
  try {
    const userId = generateId("user");
    if (userId.startsWith("user_")) {
      console.log("✅ Test 4: ID generation working (generated:", userId + ")");
      passedTests++;
    } else {
      console.log("❌ Test 4: ID generation format incorrect");
    }
  } catch (e) {
    console.log("❌ Test 4: ID generation failed:", (e as Error).message);
  }

  // Test 5: User creation simulation
  totalTests++;
  try {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = "SecurePassword123!";
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    const userId = generateId("user");

    const [newUser] = await db
      .insert(user)
      .values({
        id: userId,
        email: testEmail,
        name: "Test User",
        password: hashedPassword,
        emailVerified: new Date(),
      })
      .returning();

    if (newUser.email === testEmail) {
      console.log("✅ Test 5: User creation working correctly");
      passedTests++;

      // Clean up test user
      await db.delete(user).where(eq(user.id, userId));
    } else {
      console.log("❌ Test 5: User creation verification failed");
    }
  } catch (e) {
    console.log("❌ Test 5: User creation failed:", (e as Error).message);
  }

  console.log(
    `\n📊 Results: ${passedTests}/${totalTests} tests passed\n`
  );

  if (passedTests === totalTests) {
    console.log("✨ All authentication components verified successfully!");
    console.log("\n📝 Next steps:");
    console.log("  1. Run 'npm run dev' to start the development server");
    console.log("  2. Visit http://localhost:3000/login");
    console.log("  3. Test sign up at http://localhost:3000/signup");
    console.log("  4. For email/magic link: Set up MailHog or configure SMTP");
    process.exit(0);
  } else {
    console.log("⚠️  Some tests failed. Please review the errors above.");
    process.exit(1);
  }
}

verifyAuthSetup().catch((error) => {
  console.error("Fatal error during verification:", error);
  process.exit(1);
});
