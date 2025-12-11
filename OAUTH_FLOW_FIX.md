# OAuth Flow Fix

## Issues Found

### 1. **Strict refresh_token check on signIn**
The `signIn` callback was returning `false` if `refresh_token` was missing, but Google may not always provide a refresh_token on subsequent sign-ins (if user already consented). This was causing authentication failures.

**Fix Applied:**
- Made refresh_token optional for existing users
- Only require refresh_token for first-time sign-ins
- Preserve existing refresh_token if new one not provided

### 2. **Insufficient error logging**
Hard to debug OAuth failures without detailed logs.

**Fix Applied:**
- Added detailed console logging
- Log warnings vs errors appropriately
- Log error messages and stack traces

## How the OAuth Flow Works Now

1. **User clicks "Sign in with Google"**
   - Redirects to `/api/auth/signin/google`
   - NextAuth redirects to Google OAuth

2. **User authorizes on Google**
   - Google redirects back to `/api/auth/callback/google`
   - NextAuth processes the callback

3. **signIn callback executes**
   - Validates account data
   - Creates new user OR updates existing user
   - Stores tokens in Redis
   - Returns `true` to allow sign-in

4. **jwt callback executes**
   - Stores tokens in JWT
   - Returns token data

5. **session callback executes**
   - Adds user ID to session
   - Returns session data

6. **User redirected to dashboard**

## Common Issues & Solutions

### Issue: `error=google` still appears

**Possible causes:**
1. **OAuth consent screen not configured** - Check Google Console
2. **Missing test user** (for external apps) - Add yourself as test user
3. **Missing Calendar scope** - Add `https://www.googleapis.com/auth/calendar.readonly`
4. **Client secret mismatch** - Verify `.env.local` matches Google Console
5. **Database/Redis error** - Check server logs for errors in signIn callback

### Debugging Steps

1. **Check server logs** - Look for console.error messages
2. **Check browser console** - Look for JavaScript errors
3. **Check Network tab** - Inspect the OAuth callback request
4. **Verify environment variables** - Ensure all are set correctly
5. **Restart dev server** - After changing `.env.local`

## Testing

After these fixes:
1. Clear browser cookies for localhost
2. Restart dev server
3. Try signing in again
4. Check server logs for any errors

If it still fails, the detailed logs will show exactly where it's failing.
