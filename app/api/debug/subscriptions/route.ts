import { NextResponse } from 'next/server';
import { getSession } from '@/app/lib/auth';
import { redis } from '@/app/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all subscriptions for this user
    const subscriptionKeys = await redis.keys('calendar_subscription:*');
    const subscriptions = [];

    for (const key of subscriptionKeys) {
      const subData = await redis.hgetall(key);
      if (!subData || Object.keys(subData).length === 0) continue;

      // Filter by user
      if (subData.user_id !== session.user.id) continue;

      subscriptions.push({
        id: key.replace('calendar_subscription:', ''),
        calendar_summary: subData.calendar_summary,
        calendar_id: subData.calendar_id,
        active: (subData.active as any) === 'true' || (subData.active as any) === true,
        sync_token: subData.sync_token || undefined,
        last_sync_at: subData.last_sync_at || undefined,
        google_channel_id: subData.google_channel_id || undefined,
        google_resource_id: subData.google_resource_id || undefined,
        google_channel_expiration: subData.google_channel_expiration
          ? parseInt(subData.google_channel_expiration as string)
          : undefined,
        notify_new_events: (subData.notify_new_events as any) === 'true' || (subData.notify_new_events as any) === true,
        notify_updates: (subData.notify_updates as any) === 'true' || (subData.notify_updates as any) === true,
        notify_cancellations:
          (subData.notify_cancellations as any) === 'true' || (subData.notify_cancellations as any) === true,
        notify_window_minutes: parseInt(subData.notify_window_minutes as string) || 0,
      });
    }

    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error('Error fetching debug subscriptions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
