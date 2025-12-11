import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createUser, getUser, updateUser } from '@/app/lib/redis';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
      // Validate required data
      if (!account) {
        console.error('signIn callback: No account provided');
        return false;
      }

      if (!account.access_token) {
        console.error('signIn callback: No access_token provided');
        return false;
      }

      // Note: refresh_token might not be provided on subsequent sign-ins
      // if user already consented. We handle this by keeping existing refresh_token.
      if (!account.refresh_token) {
        console.warn('signIn callback: No refresh_token provided - this may happen on subsequent sign-ins');
      }

      const googleUserId = account.providerAccountId;
      const email = user.email;

      if (!googleUserId || !email) {
        console.error('signIn callback: Missing googleUserId or email', { googleUserId, email });
        return false;
      }

      try {
        let existingUser = await getUser(googleUserId);

        if (!existingUser) {
          // First time sign-in - refresh_token should be present
          if (!account.refresh_token) {
            console.error('signIn callback: First sign-in requires refresh_token but none provided');
            return false;
          }

          // Create new user
          await createUser({
            google_user_id: googleUserId,
            email,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            access_token_expires_at: account.expires_at
              ? account.expires_at * 1000
              : Date.now() + 3600 * 1000,
          });
          console.log('Created new user:', email);
        } else {
          // Update tokens - preserve existing refresh_token if new one not provided
          await updateUser(googleUserId, {
            access_token: account.access_token,
            refresh_token: account.refresh_token || existingUser.refresh_token,
            access_token_expires_at: account.expires_at
              ? account.expires_at * 1000
              : Date.now() + 3600 * 1000,
          });
          console.log('Updated user tokens:', email);
        }

        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        // Log more details for debugging
        if (error instanceof Error) {
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        }
        return false;
      }
    },
    async jwt({ token, account, user }) {
      // Initial sign in
      if (account && user) {
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
        return token;
      }

      // Access token has expired, try to update it
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.google_user_id as string;
      }
      session.access_token = token.access_token as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: '/signin',
  },
  session: {
    strategy: 'jwt',
  },
};

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

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

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
    console.error('Error refreshing access token:', error);

    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

