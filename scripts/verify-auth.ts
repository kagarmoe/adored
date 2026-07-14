import dotenv from "dotenv";

// Load environment variables from .env.local or .env.development.local
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

import { getDb } from "@/lib/db";
import { user, account, session, verification } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

  // Test 2: better-auth core tables exist
  totalTests++;
  try {
    await db.select().from(account).limit(1);
    await db.select().from(session).limit(1);
    await db.select().from(verification).limit(1);
    console.log("✅ Test 2: better-auth tables (account, session, verification) accessible");
    passedTests++;
  } catch (e) {
    console.log("❌ Test 2: better-auth tables not accessible:", (e as Error).message);
  }

  // Test 3: account table supports OAuth/provider links
  totalTests++;
  try {
    await db
      .select({
        providerId: account.providerId,
        accountId: account.accountId,
      })
      .from(account)
      .limit(1);
    console.log("✅ Test 3: account provider-link columns accessible");
    passedTests++;
  } catch (e) {
    console.log("❌ Test 3: account provider-link columns not accessible:", (e as Error).message);
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

  // Test 5: User creation simulation (canonical better-auth `user` shape)
  totalTests++;
  try {
    const testEmail = `test-${Date.now()}@example.com`;
    const userId = generateId("user");

    const [newUser] = await db
      .insert(user)
      .values({
        id: userId,
        email: testEmail,
        name: "Test User",
        emailVerified: true,
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
    console.log("  3. Configure GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET for Google login");
    console.log("  4. Configure RESEND_API_KEY only if invitation email should send");
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
