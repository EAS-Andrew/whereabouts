import { redirect } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import Link from 'next/link';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;

  if (session) {
    redirect('/dashboard');
  }

  const error = params.error;

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
              <p className="font-medium">Authentication Error</p>
              <p className="mt-1">
                {error === 'Configuration' && 'OAuth configuration error. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'}
                {error === 'AccessDenied' && 'Access denied. Ensure you have access to this application.'}
                {error === 'Verification' && 'Verification error. Please try again.'}
                {error === 'google' && 'Google OAuth error. Check redirect URI and OAuth settings.'}
                {!['Configuration', 'AccessDenied', 'Verification', 'google'].includes(error) &&
                  `Error: ${error}`}
              </p>
              <p className="mt-2 text-xs">
                Common fixes:
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Redirect URI must be: <code className="bg-red-100 px-1 rounded">http://localhost:3000/api/auth/callback/google</code></li>
                  <li>Ensure Google Calendar API is enabled</li>
                  <li>Verify OAuth consent screen is configured</li>
                  <li>Add yourself as a test user (for external apps)</li>
                  <li>Check environment variables are set correctly</li>
                </ul>
              </p>
            </div>
          </div>
        )}

        <div className="mt-8">
          <Link
            href="/api/auth/signin/google?callbackUrl=/dashboard"
            className="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Sign in with Google
          </Link>
        </div>
      </div>
    </div>
  );
}
