import { NextResponse } from 'next/server';
import { auth } from '../[...nextauth]/route';

// Debug endpoint to check auth state
export async function GET() {
  try {
    const session = await auth();

    return NextResponse.json({
      hasSession: !!session,
      session: session
        ? {
          user: {
            id: session.user?.id,
            email: session.user?.email,
            name: session.user?.name,
          },
          hasAccessToken: !!session.access_token,
          error: session.error,
        }
        : null,
      env: {
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        nextAuthUrl: process.env.NEXTAUTH_URL,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
