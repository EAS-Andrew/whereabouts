import { NextResponse } from 'next/server';
import { getSession } from '@/app/lib/auth';
import { setupWatchChannel } from '@/app/lib/sync';
import { getCalendarSubscription } from '@/app/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const subscription = await getCalendarSubscription(id);

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (subscription.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // Refresh watch channel
    await setupWatchChannel(id, baseUrl);

    return NextResponse.json({
      message: 'Watch channel refreshed',
      subscriptionId: id,
    });
  } catch (error) {
    console.error('Error refreshing watch channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
