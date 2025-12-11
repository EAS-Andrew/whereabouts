import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getServerSession } from 'next-auth';

// Helper function to get session
export async function getSession() {
  return await getServerSession(authOptions);
}
