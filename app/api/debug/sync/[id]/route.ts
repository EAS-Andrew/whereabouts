import { NextResponse } from 'next/server';
import { getSession } from '@/app/lib/auth';
import { syncSubscription } from '@/app/lib/sync';
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

    // Trigger sync asynchronously
    syncSubscription(id)
      .then(() => {
        console.log(`[Debug] Manual sync completed for subscription ${id}`);
      })
      .catch((error) => {
        console.error(`[Debug] Manual sync failed for subscription ${id}:`, error);
      });

    return NextResponse.json({
      message: 'Sync triggered',
      subscriptionId: id,
    });
  } catch (error) {
    console.error('Error triggering sync:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
