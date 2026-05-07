import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { PurseAdapter } from './lib/auth-adapter'
import { db } from './lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PurseAdapter(),
  providers: [
    Resend({
      from: 'Purseinator <onboarding@resend.dev>',
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=true',
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      const dbUser = await db.user.findUnique({ where: { email: user.email } })
      return !!dbUser
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await db.user.findUnique({ where: { email: user.email } })
        if (dbUser) {
          token.id = String(dbUser.id)
          token.role = dbUser.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      if (token.role) (session.user as { role?: string }).role = token.role as string
      return session
    },
  },
})
