// NOTE: Using JWT sessions (Option B) instead of PrismaAdapter for two reasons:
// 1. @auth/prisma-adapter imports PrismaClient from "@prisma/client", but this project
//    uses Prisma 7's TypeScript generator with output to lib/generated/prisma — the types
//    are not compatible without unsafe casting.
// 2. The User model uses Int IDs (@id @default(autoincrement())), while Auth.js adapters
//    expect string IDs. Migrating to string IDs is a separate schema change.
// TODO: Switch to PrismaAdapter once User.id is migrated to String and adapter types align.
import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Resend({
      from: 'Purseinator <noreply@purseinator.app>',
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=true',
  },
})
