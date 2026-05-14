import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { PurseAdapter } from './lib/auth-adapter'
import { signInCallback, jwtCallback, sessionCallback } from './lib/auth-callbacks'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PurseAdapter(),
  providers: [
    Resend({
      from: 'PurseInator <onboarding@resend.dev>',
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=true',
  },
  callbacks: {
    signIn: ({ user }) => signInCallback({ user }),
    jwt: ({ token, user }) => jwtCallback({ token, user }),
    session: ({ session, token }) => sessionCallback({ session, token }),
  },
})
