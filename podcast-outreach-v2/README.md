# Podcast Outreach V2

An upgraded podcast outreach automation system with **working email automation**, **reply detection**, and **email verification**.

## 🆕 What's New in V2

| Feature | V1 Status | V2 Status |
|---------|-----------|-----------|
| **Scheduled Email Sending** | ❌ Only marked status | ✅ Actually sends via Gmail API |
| **Reply Detection** | ❌ TODO comments | ✅ Full webhook + polling |
| **Bounce Detection** | ❌ Not implemented | ✅ Automatic handling |
| **Email Verification** | ❌ Only tips | ✅ ZeroBounce/MillionVerifier integration |
| **Analytics Export** | ❌ Not built | ✅ CSV + JSON export |
| **Gmail Thread Tracking** | ❌ No storage | ✅ Stored on Touch records |

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd podcast-outreach-v2
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Gmail OAuth (required for email sending)
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="https://your-domain.com/api/auth/gmail/callback"

# AI (for draft generation)
ANTHROPIC_API_KEY="your-anthropic-key"

# Email Verification (optional but recommended)
ZEROBOUNCE_API_KEY="your-zerobounce-key"
# OR
MILLIONVERIFIER_API_KEY="your-millionverifier-key"
# OR
ABSTRACT_API_KEY="your-abstract-key"

# Cron Security (optional but recommended)
CRON_SECRET="a-secure-random-string"

# App URL
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

### 3. Run Database Migrations

```bash
npm run db:push
# OR for production
npx prisma migrate deploy
```

### 4. Start Development Server

```bash
npm run dev
```

---

## 📧 New Email Automation Features

### Scheduled Email Cron Job

**Endpoint:** `GET /api/cron/send-scheduled-emails`

This cron job **actually sends emails** (unlike V1 which only updated status):

```bash
# Trigger manually
curl -X GET "https://your-domain.com/api/cron/send-scheduled-emails" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**What it does:**
1. Finds podcasts with `status: FOLLOW_UP_DUE`
2. Generates follow-up email content
3. **Sends via Gmail API**
4. Creates Touch record with `gmailThreadId`
5. Updates podcast status to `FOLLOW_UP_SENT`

**Schedule recommendation:** Run every hour during business hours (9 AM - 5 PM)

### Reply Detection

**Two methods available:**

1. **Gmail Webhook (Real-time):**
   - Endpoint: `POST /api/webhooks/gmail`
   - Receives push notifications from Gmail
   - Processes immediately when replies arrive

2. **Polling Cron (Backup):**
   - Endpoint: `GET /api/cron/check-replies`
   - Checks all pending threads for replies
   - Run every 4 hours as backup

### Email Verification

**Endpoint:** `POST /api/verify-email`

Verify emails before sending to reduce bounces:

```bash
curl -X POST "https://your-domain.com/api/verify-email" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

**Response:**
```json
{
  "email": "test@example.com",
  "isValid": true,
  "isDeliverable": true,
  "confidence": 95,
  "status": "valid",
  "reason": "Email is valid and deliverable"
}
```

### Analytics Export

**Endpoint:** `GET /api/analytics/export`

Export your outreach data:

```bash
# Full export (CSV)
curl "https://your-domain.com/api/analytics/export?type=full"

# Summary only
curl "https://your-domain.com/api/analytics/export?type=summary&format=json"

# Filter by date
curl "https://your-domain.com/api/analytics/export?dateFrom=2026-01-01&dateTo=2026-01-31"
```

**Export types:**
- `full` - All podcasts with touch counts
- `summary` - Statistics overview
- `touches` - All email interactions
- `campaigns` - Campaign storage data

---

## 🗄️ Database Schema Changes

New fields added to `Touch` model:

```prisma
model Touch {
  // ... existing fields ...
  
  // NEW: Gmail tracking
  gmailMessageId String?   // Gmail message ID
  gmailThreadId  String?   // Gmail thread ID for reply tracking
  bounceReason   String?   // Bounce reason if applicable
  
  @@index([gmailThreadId])
}
```

**Migration command:**
```bash
npx prisma migrate deploy
```

---

## ⏰ Cron Job Setup (Railway/Vercel)

### Railway

Add to `railway.json`:

```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm run start"
  },
  "crons": [
    {
      "schedule": "0 */1 9-17 * * *",
      "endpoint": "/api/cron/send-scheduled-emails",
      "comment": "Send scheduled emails every hour during business hours"
    },
    {
      "schedule": "0 0 */4 * * *",
      "endpoint": "/api/cron/check-replies",
      "comment": "Check for replies every 4 hours"
    },
    {
      "schedule": "0 0 8 * * 1-5",
      "endpoint": "/api/cron/daily-workflow",
      "comment": "Run daily workflow at 8 AM on weekdays"
    }
  ]
}
```

### Vercel

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-scheduled-emails",
      "schedule": "0 */1 9-17 * * *"
    },
    {
      "path": "/api/cron/check-replies",
      "schedule": "0 0 */4 * * *"
    }
  ]
}
```

---

## 🔐 Gmail Webhook Setup (Optional)

For real-time reply detection:

1. **Create a Google Cloud Pub/Sub topic**
   - Go to Google Cloud Console → Pub/Sub → Create Topic
   - Name it something like `gmail-notifications`

2. **Create a push subscription**
   - Create subscription pointing to: `https://your-domain.com/api/webhooks/gmail`
   - Set acknowledgement deadline to 60 seconds

3. **Enable Gmail push notifications**
   - Use Gmail API to watch the inbox:
   ```bash
   curl -X POST "https://gmail.googleapis.com/gmail/v1/users/me/watch" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "topicName": "projects/YOUR_PROJECT/topics/gmail-notifications",
       "labelIds": ["INBOX"]
     }'
   ```

**Note:** The polling cron (`/api/cron/check-replies`) works without webhook setup and is a reliable alternative.

---

## 📁 New Files in V2

```
src/
├── app/api/
│   ├── cron/
│   │   ├── send-scheduled-emails/    # NEW: Actually sends emails
│   │   │   └── route.ts
│   │   └── check-replies/            # NEW: Polls for replies
│   │       └── route.ts
│   ├── analytics/
│   │   └── export/                   # NEW: CSV/JSON export
│   │       └── route.ts
│   ├── verify-email/                 # NEW: Email verification
│   │   └── route.ts
│   └── webhooks/
│       └── gmail/                    # UPDATED: Full implementation
│           └── route.ts
└── lib/
    └── email-verifier.ts             # NEW: Multi-provider verification
```

---

## 🔄 Migration from V1

1. **Keep V1 running** while testing V2
2. **Copy your database** or use a separate DB for V2
3. **Run migrations** to add new fields
4. **Test cron jobs** manually before enabling auto-run
5. **Switch DNS/deployment** when ready

---

## 📊 Monitoring

Check cron job results:

```bash
# View recent sends
curl "https://your-domain.com/api/analytics/export?type=touches&format=json"

# Check for any issues
curl "https://your-domain.com/api/cron/send-scheduled-emails"
```

---

## 🐛 Troubleshooting

### "Gmail not connected"
- Go to Settings in the app
- Click "Connect Gmail"
- Complete OAuth flow

### Emails not sending
- Check `SENDING_RULES.DAILY_CAP` in constants.ts (default: 10)
- Verify Gmail OAuth tokens are valid
- Check podcasts have `status: FOLLOW_UP_DUE`

### Reply detection not working
- Ensure `gmailThreadId` is stored on Touch records
- Check `/api/cron/check-replies` logs
- Verify Gmail scopes include `gmail.readonly`

---

## 📝 License

Private project - not for redistribution.
