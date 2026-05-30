# PurseInator Deployment Guide

## Vercel Deployment

PurseInator is optimized for deployment on [Vercel](https://vercel.com), with automatic environment variable validation and Vercel Blob storage integration for photo uploads.

### Prerequisites

1. **Vercel Account** — Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository** — Project must be pushed to GitHub
3. **PostgreSQL Database** — Vercel Postgres or external managed database
4. **Email Provider** — SMTP credentials for transactional emails (optional for development)

### Step 1: Create Vercel Project

```bash
# Option A: Via Vercel CLI
vercel

# Option B: Via Vercel Dashboard
# 1. Go to https://vercel.com/dashboard
# 2. Click "Add New" → "Project"
# 3. Select GitHub repository
# 4. Vercel auto-detects Next.js configuration
```

### Step 2: Configure Environment Variables

In Vercel Project Settings → Environment Variables, add:

#### Required (All Environments)

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Vercel Postgres or external DB connection string |
| `NEXTAUTH_SECRET` | `(generated value)` | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://your-domain.vercel.app` | Production domain. Use `http://localhost:3000` for preview |

#### Optional (Production)

| Variable | Example | Notes |
|----------|---------|-------|
| `EMAIL_SERVER_HOST` | `smtp.provider.com` | SMTP hostname (Resend, SendGrid, AWS SES, etc.) |
| `EMAIL_SERVER_PORT` | `587` | SMTP port (usually 587 or 465) |
| `EMAIL_SERVER_USER` | `api_user@provider.com` | SMTP username or API key |
| `EMAIL_SERVER_PASSWORD` | `smtp_password` | SMTP password or API secret |
| `EMAIL_FROM` | `noreply@yourdomain.com` | Sender email address |

#### Auto-Configured by Vercel

- `BLOB_READ_WRITE_TOKEN` — Automatically set for Vercel Blob storage access
- `NODE_ENV` — Automatically set based on deployment environment

### Step 3: Connect Database

#### Option A: Vercel Postgres (Recommended)

```bash
# In Vercel Dashboard:
# 1. Go to Storage tab
# 2. Click "Create Database" → "Postgres"
# 3. Vercel auto-populates DATABASE_URL
```

#### Option B: External PostgreSQL

```bash
# Manually add DATABASE_URL environment variable with your connection string
# Format: postgresql://user:password@host:port/database
```

### Step 4: Run Database Migration

After deployment is connected to database:

```bash
# SSH into Vercel deployment
vercel env pull  # Pull environment variables locally

# Run migration (once per database)
npm run db:migrate
```

Or manually via Vercel CLI:

```bash
vercel env pull
npm run db:migrate
```

### Step 5: Deploy

```bash
# Push to GitHub (automatically triggers Vercel deployment)
git push origin main

# Or manually trigger via Vercel Dashboard
```

### Step 6: Verify Deployment

```bash
# Check build logs
vercel logs

# Test authentication
# 1. Visit https://your-domain.vercel.app/login
# 2. Try sign up or email sign-in
# 3. Check Vercel logs for magic link output (development only)
```

## Feature Integration on Vercel

### Photo Upload (Vercel Blob)

- **Automatic** — `BLOB_READ_WRITE_TOKEN` is auto-configured
- **Bucket** — Files stored in Vercel Blob storage
- **CDN** — Photos served via Vercel's global CDN
- **Cost** — Included in Vercel project

### Email (Transactional)

#### Development
- Magic links printed to console (no SMTP needed)
- Password reset emails not sent

#### Production
- Configure SMTP provider:
  - **Resend** (recommended) — Free tier, 100 emails/day
  - **SendGrid** — Free tier, 100 emails/day
  - **AWS SES** — Pay-per-email, lowest cost at scale
  - **Postmark** — Enterprise-grade, $1.50/month
  - **Gmail** — Requires app password (not recommended)

Example: Setting up Resend

```bash
# 1. Create account at https://resend.com
# 2. Generate API key
# 3. In Vercel Environment Variables:
#    EMAIL_SERVER_HOST = smtp.resend.com
#    EMAIL_SERVER_PORT = 587
#    EMAIL_SERVER_USER = resend
#    EMAIL_SERVER_PASSWORD = re_xxxxx (your API key)
```

### Database Backup & Recovery

```bash
# Backup database locally
pg_dump $DATABASE_URL > backup.sql

# Restore from backup
psql $DATABASE_URL < backup.sql

# Vercel Postgres automatic backups
# Available in Storage tab → Backups
```

## Environment Validation

All environment variables are validated at build time and runtime using Zod schemas in `src/lib/env.ts`.

Missing or invalid variables will cause:
- **Build Failure** — Configuration errors caught during build
- **Runtime Error** — Invalid values throw on first request

Check Vercel build logs if deployment fails:
```bash
vercel logs --follow
```

## Performance Optimization

### Vercel-Specific Settings

The `vercel.ts` configuration includes:
- Automatic Next.js framework detection
- Static asset caching (1 year for immutable assets)
- Request/response optimization
- Regional latency reduction

### Monitoring

1. **Vercel Dashboard** → Analytics tab
2. **Web Vitals** — Automatically tracked
3. **Serverless Function Duration** — Monitor in deployment logs
4. **Error Tracking** — Failed requests visible in logs

## Troubleshooting

### Build Failures

```bash
# 1. Check environment variables
vercel env list

# 2. Check build logs
vercel logs

# 3. Verify database connection
vercel env pull
npm run db:migrate
```

### Environment Variable Not Found

```bash
# Variables are case-sensitive. Verify exact names:
vercel env list

# For preview deployments, set environment:
# Vercel Dashboard → Environment Variables → Preview
```

### Photo Upload Not Working

```bash
# Verify Vercel Blob is enabled
vercel env list | grep BLOB

# Check storage usage
# Vercel Dashboard → Storage → Blob Storage
```

### Email Not Sending

```bash
# 1. Verify SMTP credentials in Vercel Dashboard
# 2. Check Vercel logs for SMTP errors:
vercel logs --grep email

# 3. Test locally with environment variables:
vercel env pull
npm run dev
```

## Rolling Back

```bash
# Revert to previous deployment
vercel rollback

# Or redeploy specific commit
git revert <commit-hash>
git push origin main
```

## Production Readiness Checklist

- [ ] Database URL configured and migration run
- [ ] NEXTAUTH_SECRET set and >= 32 characters
- [ ] NEXTAUTH_URL matches production domain
- [ ] Email provider configured (if using transactional emails)
- [ ] Custom domain added (if not using vercel.app domain)
- [ ] SSL certificate verified
- [ ] Build logs show no errors or warnings
- [ ] Auth flow tested (login, signup, password reset)
- [ ] Photo upload tested
- [ ] Performance metrics acceptable
