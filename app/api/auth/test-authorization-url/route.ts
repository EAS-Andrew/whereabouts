import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Generate authorization URL manually (no need to access providers in v5)
    const callbackUrl = `${process.env.NEXTAUTH_URL}/api/auth/callback/google`;

    // Build the authorization URL
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: 'test-state',
    });

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return NextResponse.json({
      success: true,
      configuration: {
        clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...',
        hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        nextAuthUrl: process.env.NEXTAUTH_URL,
        callbackUrl,
      },
      authorizationUrl,
      expectedRedirectUri: callbackUrl,
      instructions: {
        step1: 'Compare the callbackUrl above with what you have in Google Console',
        step2: 'The redirect URI in Google Console must EXACTLY match',
        step3: 'For internal apps, make sure you are signed in with a Workspace account',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate authorization URL',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
