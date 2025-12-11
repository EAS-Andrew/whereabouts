'use server';

import { signIn } from '@/app/api/auth/[...nextauth]/route';

export async function handleGoogleSignIn() {
  await signIn('google', { redirectTo: '/dashboard' });
}
