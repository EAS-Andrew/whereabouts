import { redirect } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import { handleGoogleSignIn } from './actions';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string; callbackUrl?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;

  if (session) {
    redirect('/dashboard');
  }

  const error = params.error;
  const errorDescription = params.error_description;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Sign in to Whereabouts
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Connect your Google Calendar to Discord
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-800">
              <p className="font-medium">Authentication Error: {error}</p>

              {/* Show Google's error description if available */}
              {errorDescription && (
                <div className="mt-2 p-2 bg-red-100 rounded border border-red-200">
                  <p className="font-semibold text-xs uppercase text-red-900 mb-1">Google Error Details:</p>
                  <p className="text-sm font-mono break-words">{errorDescription}</p>
                </div>
              )}

              <p className="mt-2">
                {error === 'Configuration' && 'OAuth configuration error. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env.local file.'}
                {error === 'AccessDenied' && 'Access denied. Ensure you have access to this application. You may need to be added as a test user in Google Console.'}
                {error === 'Verification' && 'Verification error. This usually means the OAuth state or nonce verification failed.'}
                {error === 'google' && (
                  <>
                    Google OAuth error. {errorDescription ? 'See error details above.' : 'Check the server logs for detailed error information.'}
                    <br />
                    Common causes: redirect URI mismatch, missing scopes, consent screen issues, or test user not added.
                  </>
                )}
                {error === 'OAuthAccountNotLinked' && 'Account not linked. This account is already associated with another user.'}
                {error === 'OAuthCallback' && 'OAuth callback error. Check redirect URI configuration.'}
                {!['Configuration', 'AccessDenied', 'Verification', 'google', 'OAuthAccountNotLinked', 'OAuthCallback'].includes(error) &&
                  `Unknown error: ${error}. ${errorDescription || 'Check server logs for details.'}`}
              </p>
              <p className="mt-2 text-xs text-red-700">
                <strong>Check your server terminal/console for detailed error logs.</strong>
              </p>
              <p className="mt-2 text-xs">
                Common fixes:
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Redirect URI must be: <code className="bg-red-100 px-1 rounded">http://localhost:3000/api/auth/callback/google</code></li>
                  <li>Ensure Google Calendar API is enabled</li>
                  <li>Verify OAuth consent screen is configured with Calendar scope</li>
                  <li>Add yourself as a test user (for external apps)</li>
                  <li>Check environment variables are set correctly</li>
                  <li>Restart dev server after changing .env.local</li>
                </ul>
              </p>
              <div className="mt-3 pt-3 border-t border-red-200">
                <p className="text-xs font-mono text-red-600">
                  Debug endpoint: <a href="/api/auth/debug" target="_blank" className="underline">/api/auth/debug</a>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <form action={handleGoogleSignIn}>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Sign in with Google
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
