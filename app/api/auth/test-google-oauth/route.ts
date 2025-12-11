import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/test-google-oauth`;

  // If we have an error from Google
  if (error) {
    return NextResponse.json({
      success: false,
      error: error,
      message: 'Google OAuth returned an error',
      errorDescription: url.searchParams.get('error_description'),
    });
  }

  // If we have a code, exchange it for tokens
  if (code) {
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        return NextResponse.json({
          success: false,
          error: 'token_exchange_failed',
          message: 'Failed to exchange code for tokens',
          details: tokenData,
          statusCode: tokenResponse.status,
        });
      }

      // Test the access token by fetching user info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const userInfo = await userInfoResponse.json();

      return NextResponse.json({
        success: true,
        message: 'Google OAuth test successful! ✅',
        userInfo,
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        scopes: tokenData.scope,
        expiresIn: tokenData.expires_in,
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: 'exception',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  // No code yet - generate the authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/calendar.readonly');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return NextResponse.json({
    message: 'Google OAuth Test Endpoint',
    instructions: 'Click the link below to test Google OAuth',
    authUrl: authUrl.toString(),
    redirectUri: redirectUri,
    clientId: clientId.substring(0, 20) + '...',
    note: 'Make sure this redirect URI is added in Google Cloud Console',
  });
}
