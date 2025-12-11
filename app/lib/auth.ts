import { auth } from '@/app/api/auth/[...nextauth]/route';

// Helper function to get session (Auth.js v5)
export async function getSession() {
  return await auth();
}
