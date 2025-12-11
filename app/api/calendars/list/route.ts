import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { listCalendars } from '@/app/lib/google-calendar';
import { getUser } from '@/app/lib/redis';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const calendars = await listCalendars(user.google_user_id);

    return NextResponse.json({ calendars });
  } catch (error) {
    console.error('Error listing calendars:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list calendars' },
      { status: 500 }
    );
  }
}
