import type { Adapter, AdapterUser } from 'next-auth/adapters'
import { db } from './db'

function toAdapterUser(user: { id: number; email: string; name: string }): AdapterUser {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    emailVerified: null,
    image: null,
  }
}

export function PurseAdapter(): Adapter {
  return {
    async createUser() {
      throw new Error('Direct sign-up is not allowed. Ask the operator to create your account.')
    },

    async getUser(id) {
      const user = await db.user.findUnique({ where: { id: parseInt(id) } })
      return user ? toAdapterUser(user) : null
    },

    async getUserByEmail(email) {
      const user = await db.user.findUnique({ where: { email } })
      return user ? toAdapterUser(user) : null
    },

    async getUserByAccount() {
      return null
    },

    async updateUser(user) {
      const updated = await db.user.update({
        where: { id: parseInt(user.id) },
        data: { name: user.name ?? undefined },
      })
      return toAdapterUser(updated)
    },

    async linkAccount() {
      return undefined
    },

    async createVerificationToken(token) {
      await db.verificationToken.create({ data: token })
      return token
    },

    async useVerificationToken({ identifier, token }) {
      try {
        return await db.verificationToken.delete({
          where: { identifier_token: { identifier, token } },
        })
      } catch {
        return null
      }
    },
  }
}
