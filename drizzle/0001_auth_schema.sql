-- Rename users table to user (NextAuth canonical)
ALTER TABLE users RENAME TO "user";
ALTER TABLE "user" RENAME COLUMN created_at TO createdAt;
ALTER TABLE "user" RENAME COLUMN updated_at TO updatedAt;
ALTER INDEX IF EXISTS users_email_idx RENAME TO user_email_idx;

-- Add NextAuth columns to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS emailVerified timestamp,
                     ADD COLUMN IF NOT EXISTS image text,
                     ADD COLUMN IF NOT EXISTS password text;

-- Drop createdAt, updatedAt, deletedAt from user (NextAuth schema doesn't use them)
ALTER TABLE "user" DROP COLUMN IF EXISTS createdAt;
ALTER TABLE "user" DROP COLUMN IF EXISTS updatedAt;
ALTER TABLE "user" DROP COLUMN IF EXISTS deletedAt;

-- Create account table
CREATE TABLE IF NOT EXISTS account (
  userId text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type text NOT NULL,
  provider text NOT NULL,
  providerAccountId text NOT NULL,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  PRIMARY KEY (provider, providerAccountId)
);

CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);

-- Create session table
CREATE TABLE IF NOT EXISTS session (
  sessionToken text PRIMARY KEY,
  userId text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);

-- Create verificationToken table
CREATE TABLE IF NOT EXISTS verificationToken (
  identifier text NOT NULL,
  token text NOT NULL,
  expires timestamp NOT NULL,
  PRIMARY KEY (identifier, token)
);
