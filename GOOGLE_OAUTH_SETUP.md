# Google OAuth Setup Guide

Follow these steps to set up Google OAuth for the Whereabouts Discord application.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "Whereabouts Discord")
5. Click "Create"

## Step 2: Enable Google Calendar API

1. In your project, go to **APIs & Services** > **Library**
2. Search for "Google Calendar API"
3. Click on it and click **Enable**

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Choose **External** (unless you're using Google Workspace)
3. Fill in the required fields:
   - **App name**: Whereabouts (or your preferred name)
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click **Save and Continue**
5. On the **Scopes** page:
   - Click **Add or Remove Scopes**
   - Search for and add: `https://www.googleapis.com/auth/calendar.readonly`
   - Click **Update** then **Save and Continue**
6. On the **Test users** page (if external):
   - Add your email address as a test user
   - Click **Save and Continue**
7. Review and go back to dashboard

## Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Choose **Web application** as the application type
4. Give it a name (e.g., "Whereabouts Discord Web Client")
5. Add **Authorized redirect URIs**:
   - For local development: `http://localhost:3000/api/auth/callback/google`
   - For production: `https://your-domain.vercel.app/api/auth/callback/google`
6. Click **Create**
7. You'll see a dialog with your **Client ID** and **Client Secret**
   - Copy both values immediately (you won't see the secret again!)

## Step 5: Add Credentials to .env.local

1. Open your `.env.local` file
2. Replace the placeholders:
   ```
   GOOGLE_CLIENT_ID=paste_your_client_id_here
   GOOGLE_CLIENT_SECRET=paste_your_client_secret_here
   ```

## Step 6: Generate NEXTAUTH_SECRET

Run this command to generate a secure secret:

```bash
openssl rand -base64 32
```

Copy the output and paste it into `.env.local` as `NEXTAUTH_SECRET`.

## Step 7: Generate ENCRYPTION_KEY

Run this command to generate an encryption key (must be at least 32 characters):

```bash
openssl rand -base64 32
```

Copy the output and paste it into `.env.local` as `ENCRYPTION_KEY`.

## Quick Command Reference

Generate secrets:
```bash
# For NEXTAUTH_SECRET
openssl rand -base64 32

# For ENCRYPTION_KEY
openssl rand -base64 32
```

## Verification

After setting up, your `.env.local` should look like:

```env
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generated_secret>
REDIS_URL=redis://default:password@host:port
ENCRYPTION_KEY=<generated_key>
```

## Testing

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3000`
3. You should be redirected to sign in with Google
4. After authorizing, you should be redirected back to the dashboard

## Troubleshooting

- **"redirect_uri_mismatch" error**: Make sure the redirect URI in Google Console exactly matches `http://localhost:3000/api/auth/callback/google`
- **"access_denied" error**: Make sure you've added yourself as a test user (for external apps) or the app is published
- **API not enabled**: Make sure Google Calendar API is enabled in your project

## Production Deployment

When deploying to Vercel:
1. Add all environment variables in Vercel dashboard (Settings > Environment Variables)
2. Update the authorized redirect URI in Google Console to include your production domain
3. Make sure `NEXTAUTH_URL` is set to your production URL in Vercel
