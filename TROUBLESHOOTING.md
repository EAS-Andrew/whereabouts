# Troubleshooting OAuth Error

If you're seeing `error=google` in the URL, here's how to fix it:

## Most Common Issue: Redirect URI Mismatch

**The redirect URI in Google Console must EXACTLY match:**
```
http://localhost:3000/api/auth/callback/google
```

### Steps to Fix:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, make sure you have EXACTLY:
   - `http://localhost:3000/api/auth/callback/google`
   - No trailing slash
   - Use `http` not `https` for localhost
   - Include the full path `/api/auth/callback/google`
5. Click **Save**
6. Try signing in again

## Other Common Issues

### 1. OAuth Consent Screen Not Configured

1. Go to **APIs & Services** > **OAuth consent screen**
2. Fill in all required fields
3. Add scopes: `https://www.googleapis.com/auth/calendar.readonly`
4. Add yourself as a test user (if app is External)
5. Save all changes

### 2. Google Calendar API Not Enabled

1. Go to **APIs & Services** > **Library**
2. Search for "Google Calendar API"
3. Click **Enable** if not already enabled

### 3. Missing Environment Variables

Check your `.env.local` has:
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret
```

After changing `.env.local`, restart your dev server:
```bash
# Stop the server (Ctrl+C) and restart
npm run dev
```

### 4. Test User Not Added (External Apps)

If your app is "External":
1. Go to **OAuth consent screen**
2. Scroll to **Test users**
3. Click **+ ADD USERS**
4. Add your Google email address
5. Save

### 5. App Verification (for External Apps)

External apps have restrictions. For testing:
- Keep the app in "Testing" mode
- Add test users
- Publish the app if you need to allow any Google user (requires verification)

## Verify Your Setup

Check these in Google Console:

✅ OAuth 2.0 Client ID exists  
✅ Redirect URI: `http://localhost:3000/api/auth/callback/google`  
✅ Google Calendar API is enabled  
✅ OAuth consent screen is configured  
✅ You're added as a test user (if external)  
✅ Scopes include `https://www.googleapis.com/auth/calendar.readonly`  

## Still Having Issues?

1. Check the browser console for any JavaScript errors
2. Check the terminal/console for server errors
3. Try clearing browser cookies for localhost
4. Verify all environment variables are set correctly
5. Restart the dev server after changing `.env.local`

## Quick Test

You can test if your OAuth credentials work by visiting:
```
http://localhost:3000/api/auth/signin/google
```

This should redirect you to Google's sign-in page. If it doesn't, check:
- `GOOGLE_CLIENT_ID` is correct
- `GOOGLE_CLIENT_SECRET` is correct
- Redirect URI is configured in Google Console
