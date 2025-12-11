import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createUser, getUser, updateUser } from '@/app/lib/redis';

// Validate environment variables on startup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const NEXTAUTH_URL = process.env.NEXTAUTH_URL;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('❌ [NextAuth Config] Missing Google OAuth credentials!');
  console.error('   GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Missing');
  console.error('   GOOGLE_CLIENT_SECRET:', GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
}

if (!NEXTAUTH_URL || !NEXTAUTH_SECRET) {
  console.error('❌ [NextAuth Config] Missing NextAuth configuration!');
  console.error('   NEXTAUTH_URL:', NEXTAUTH_URL || '✗ Missing');
  console.error('   NEXTAUTH_SECRET:', NEXTAUTH_SECRET ? '✓ Set' : '✗ Missing');
}

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && NEXTAUTH_URL && NEXTAUTH_SECRET) {
  console.log('✅ [NextAuth Config] All environment variables are set');
  console.log('   NEXTAUTH_URL:', NEXTAUTH_URL);
  console.log('   GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');
}

async function refreshAccessToken(token: any) {
  try {
    const url =
      'https://oauth2.googleapis.com/token?' +
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token as string,
      });

    console.log('[refreshAccessToken] Refreshing token...');
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      console.error('[refreshAccessToken] ❌ Token refresh failed:', refreshedTokens);
      throw refreshedTokens;
    }

    console.log('[refreshAccessToken] ✅ Token refreshed successfully');

    // Update user in Redis
    const googleUserId = token.google_user_id as string;
    const user = await getUser(googleUserId);
    if (user) {
      await updateUser(googleUserId, {
        access_token: refreshedTokens.access_token,
        access_token_expires_at: Date.now() + refreshedTokens.expires_in * 1000,
      });
    }

    return {
      ...token,
      access_token: refreshedTokens.access_token,
      expires_at: Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,
      refresh_token: token.refresh_token ?? refreshedTokens.refresh_token,
    };
  } catch (error) {
    console.error('[refreshAccessToken] ❌ Error refreshing access token:', error);

    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

// Auth.js v5 configuration
export const { handlers, signIn, signOut, auth } = NextAuth({
  debug: process.env.NODE_ENV === 'development',
  trustHost: true, // Required for Next.js 15+
  providers: [
    GoogleProvider({
      clientId: GOOGLE_CLIENT_ID!,
      clientSecret: GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('[signIn callback] Starting signIn callback');
      console.log('[signIn callback] User:', { email: user.email, id: user.id, name: user.name });
      console.log('[signIn callback] Account:', {
        provider: account?.provider,
        providerAccountId: account?.providerAccountId,
        hasAccessToken: !!account?.access_token,
        hasRefreshToken: !!account?.refresh_token,
        expiresAt: account?.expires_at,
      });

      // Validate required data
      if (!account) {
        console.error('[signIn callback] ❌ No account provided');
        return false;
      }

      if (!account.access_token) {
        console.error('[signIn callback] ❌ No access_token provided');
        console.error('[signIn callback] Account object:', JSON.stringify(account, null, 2));
        return false;
      }

      // Note: refresh_token might not be provided on subsequent sign-ins
      if (!account.refresh_token) {
        console.warn('[signIn callback] ⚠️  No refresh_token provided - this may happen on subsequent sign-ins');
      }

      const googleUserId = account.providerAccountId;
      const email = user.email;

      if (!googleUserId || !email) {
        console.error('[signIn callback] ❌ Missing googleUserId or email', { googleUserId, email });
        return false;
      }

      try {
        let existingUser = await getUser(googleUserId);
        console.log('[signIn callback] Existing user lookup:', existingUser ? 'Found' : 'Not found');

        if (!existingUser) {
          // First time sign-in - refresh_token should be present
          if (!account.refresh_token) {
            console.error('[signIn callback] ❌ First sign-in requires refresh_token but none provided');
            console.error('[signIn callback] Account details:', {
              provider: account.provider,
              type: account.type,
              providerAccountId: account.providerAccountId,
            });
            return false;
          }

          // Create new user
          console.log('[signIn callback] Creating new user...');
          await createUser({
            google_user_id: googleUserId,
            email,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            access_token_expires_at: account.expires_at
              ? account.expires_at * 1000
              : Date.now() + 3600 * 1000,
          });
          console.log('[signIn callback] ✅ Created new user:', email);
        } else {
          // Update tokens - preserve existing refresh_token if new one not provided
          console.log('[signIn callback] Updating existing user tokens...');
          await updateUser(googleUserId, {
            access_token: account.access_token,
            refresh_token: account.refresh_token || existingUser.refresh_token,
            access_token_expires_at: account.expires_at
              ? account.expires_at * 1000
              : Date.now() + 3600 * 1000,
          });
          console.log('[signIn callback] ✅ Updated user tokens:', email);
        }

        return true;
      } catch (error) {
        console.error('[signIn callback] ❌ Error in signIn callback:', error);
        if (error instanceof Error) {
          console.error('[signIn callback] Error message:', error.message);
          console.error('[signIn callback] Error stack:', error.stack);
        }
        console.error('[signIn callback] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return false;
      }
    },
    async jwt({ token, account, user, trigger }) {
      console.log('[jwt callback] Trigger:', trigger || 'default');

      // Initial sign in
      if (account && user) {
        console.log('[jwt callback] Initial sign-in, storing tokens');
        return {
          ...token,
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_at: account.expires_at,
          google_user_id: account.providerAccountId,
        };
      }

      // Return previous token if the access token has not expired yet
      if (token.expires_at && Date.now() < (token.expires_at as number) * 1000) {
        console.log('[jwt callback] Token still valid, returning existing token');
        return token;
      }

      // Access token has expired, try to update it
      console.log('[jwt callback] Token expired, refreshing...');
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.google_user_id as string;
      }
      session.access_token = token.access_token as string;
      session.error = token.error as string | undefined;

      if (token.error) {
        console.error('[session callback] Session has error:', token.error);
      }

      return session;
    },
  },
  pages: {
    signIn: '/signin',
  },
  session: {
    strategy: 'jwt',
  },
});

export const { GET, POST } = handlers;
