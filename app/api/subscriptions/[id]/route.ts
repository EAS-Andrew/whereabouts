import { NextResponse } from 'next/server';
import { getSession } from '@/app/lib/auth';
import {
  getCalendarSubscription,
  updateCalendarSubscription,
  getUser,
} from '@/app/lib/redis';
import { stopWatchChannel } from '@/app/lib/google-calendar';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const user = await getUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const subscription = await getCalendarSubscription(id);
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (subscription.user_id !== user.google_user_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Stop watch channel if exists
    if (subscription.google_channel_id && subscription.google_resource_id) {
      try {
        await stopWatchChannel(
          user.google_user_id,
          subscription.google_resource_id,
          subscription.google_channel_id
        );
      } catch (error) {
        console.error('Error stopping watch channel:', error);
        // Continue with deletion anyway
      }
    }

    // Mark as inactive
    await updateCalendarSubscription(id, {
      active: false,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete subscription' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const user = await getUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const subscription = await getCalendarSubscription(id);
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (subscription.user_id !== user.google_user_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Partial<typeof subscription> = {};

    if (body.active !== undefined) updates.active = body.active;
    if (body.notify_new_events !== undefined) updates.notify_new_events = body.notify_new_events;
    if (body.notify_updates !== undefined) updates.notify_updates = body.notify_updates;
    if (body.notify_cancellations !== undefined) updates.notify_cancellations = body.notify_cancellations;
    if (body.notify_window_minutes !== undefined) updates.notify_window_minutes = body.notify_window_minutes;

    const updated = await updateCalendarSubscription(id, updates);

    return NextResponse.json({ subscription: updated });
  } catch (error) {
    console.error('Error updating subscription:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update subscription' },
      { status: 500 }
    );
  }
}
