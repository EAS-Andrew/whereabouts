# Whereabouts - Google Calendar to Discord Integration

A Next.js application that syncs Google Calendar events to Discord via webhooks using Google Calendar push notifications.

## Features

- 🔐 Google OAuth authentication with Calendar readonly access
- 📅 Sync multiple Google Calendars to Discord
- 🔔 Real-time push notifications via Google Calendar watch channels
- 💬 Rich Discord embed messages for event changes
- ⚙️ Configurable notification settings (new events, updates, cancellations)
- 🔄 Automatic watch channel renewal
- 🛡️ Encrypted storage of tokens and webhook URLs

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Auth**: NextAuth.js (Auth.js) with Google OAuth
- **Database**: Upstash Redis
- **Deployment**: Vercel
- **Cron Jobs**: Vercel Cron

## Setup

### Prerequisites

- Node.js 18+ 
- Upstash Redis account
- Google Cloud Project with OAuth credentials
- Discord server with webhook capability

### Environment Variables

Create a `.env.local` file with the following variables:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_generate_with_openssl_rand_base64_32

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

# Encryption (for tokens and webhook URLs)
ENCRYPTION_KEY=your_32_character_encryption_key
```

### Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (for development)
6. Add production redirect URI: `https://your-domain.vercel.app/api/auth/callback/google`

### Upstash Redis Setup

1. Sign up at [Upstash](https://upstash.com/)
2. Create a Redis database
3. Copy the REST URL and token to your `.env.local`

### Encryption Key

Generate a secure encryption key (32+ characters):

```bash
openssl rand -base64 32
```

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Usage

1. **Sign in** with your Google account (grants Calendar readonly access)
2. **Add Discord Webhook** - Create a webhook in your Discord server and add it to the dashboard
3. **Select Calendars** - Choose which calendars to sync
4. **Configure Notifications** - Set up notification preferences:
   - Notify on new events
   - Notify on updates
   - Notify on cancellations
   - Time window (only notify for events within X minutes)
5. **Subscribe** - Create subscriptions to start syncing

## How It Works

1. **Initial Sync**: When you subscribe to a calendar, the app performs an initial sync to fetch all events
2. **Watch Channels**: Google Calendar watch channels are set up to receive push notifications
3. **Push Notifications**: When calendar events change, Google sends a webhook to `/api/google-calendar/webhook`
4. **Incremental Sync**: The app uses sync tokens to fetch only changed events
5. **Discord Notifications**: Changed events are formatted and posted to Discord webhooks
6. **Channel Renewal**: Cron jobs automatically renew expiring watch channels

## API Routes

- `/api/auth/[...nextauth]` - Authentication endpoints
- `/api/calendars/list` - List user's Google Calendars
- `/api/calendars/subscribe` - Create a calendar subscription
- `/api/discord-channels` - Manage Discord webhook channels
- `/api/subscriptions` - List and manage subscriptions
- `/api/google-calendar/webhook` - Receive push notifications from Google
- `/api/cron/renew-subscriptions` - Cron: Renew expiring watch channels (hourly)
- `/api/cron/periodic-sync` - Cron: Safety sync for all subscriptions (daily)

## Cron Jobs

The app uses Vercel Cron jobs:

- **Renew Subscriptions** (`/api/cron/renew-subscriptions`): Runs hourly to renew watch channels expiring within 6 hours
- **Periodic Sync** (`/api/cron/periodic-sync`): Runs daily to catch any missed notifications

Configure these in `vercel.json`.

## Development

### Testing Webhooks Locally

Use a tool like [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3000
```

Update `NEXTAUTH_URL` to your ngrok URL for testing webhooks.

## Deployment

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

The cron jobs will automatically be set up from `vercel.json`.

## Security Notes

- All access tokens, refresh tokens, and webhook URLs are encrypted at rest
- Google Calendar API access is readonly
- Webhook endpoints verify request authenticity
- Cron endpoints can be protected with `CRON_SECRET`

## License

MIT
