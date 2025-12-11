import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '../[...nextauth]/route';
import Link from 'next/link';

export default async function SignInPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect('/dashboard');
  }

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
        <div className="mt-8">
          <Link
            href="/api/auth/signin/google"
            className="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Sign in with Google
          </Link>
        </div>
      </div>
    </div>
  );
}
