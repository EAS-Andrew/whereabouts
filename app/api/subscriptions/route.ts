import { NextResponse } from 'next/server';
import { getSession } from '@/app/lib/auth';
import { listUserSubscriptions } from '@/app/lib/redis';
import { getUser } from '@/app/lib/redis';

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const subscriptions = await listUserSubscriptions(user.google_user_id);

    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list subscriptions' },
      { status: 500 }
    );
  }
}
