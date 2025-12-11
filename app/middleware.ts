import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware to log OAuth callback errors and sign-in requests
export function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // Log ALL auth-related requests for debugging
  if (url.pathname.startsWith('/api/auth/')) {
    console.log('[Middleware] 🔍 Auth request:', {
      path: url.pathname,
      method: request.method,
      searchParams: Object.fromEntries(url.searchParams),
      timestamp: new Date().toISOString(),
    });
  }

  // Log OAuth sign-in initiation requests
  if (url.pathname.includes('/api/auth/signin/google')) {
    console.log('[Middleware] 📝 Sign-in request initiated:', {
      path: url.pathname,
      searchParams: Object.fromEntries(url.searchParams),
      method: request.method,
      timestamp: new Date().toISOString(),
    });
  }

  // Log OAuth callback URLs to capture Google's error details
  if (url.pathname.includes('/api/auth/callback/')) {
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const errorUri = url.searchParams.get('error_uri');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    console.log('[Middleware] 🔄 OAuth Callback received:', {
      path: url.pathname,
      hasError: !!error,
      hasCode: !!code,
      error,
      error_description: errorDescription,
      error_uri: errorUri,
      fullUrl: url.toString(),
      allParams: Object.fromEntries(url.searchParams),
      timestamp: new Date().toISOString(),
    });

    if (error) {
      console.error('[Middleware] ❌ OAuth Callback Error Detected:', {
        path: url.pathname,
        error,
        error_description: errorDescription,
        error_uri: errorUri,
        fullUrl: url.toString(),
        timestamp: new Date().toISOString(),
      });
    } else if (code) {
      console.log('[Middleware] ✅ OAuth Callback Success - Authorization code received');
    }
  }

  // Also log signin page requests with errors
  if (url.pathname === '/signin' && url.searchParams.has('error')) {
    console.error('[Middleware] ❌ Sign-in page error:', {
      error: url.searchParams.get('error'),
      error_description: url.searchParams.get('error_description'),
      callbackUrl: url.searchParams.get('callbackUrl'),
      fullUrl: url.toString(),
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/auth/:path*',
    '/signin/:path*',
  ],
};
