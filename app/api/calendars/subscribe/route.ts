import { NextResponse } from 'next/server';
import { getSession } from '@/app/lib/auth';
import { createCalendarSubscription, getUser, getDiscordChannel } from '@/app/lib/redis';
import { performInitialSync, setupWatchChannel } from '@/app/lib/sync';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      calendar_id,
      calendar_summary,
      discord_channel_id,
      notify_new_events = true,
      notify_updates = true,
      notify_cancellations = true,
      notify_window_minutes = 0,
    } = body;

    if (!calendar_id || !discord_channel_id) {
      return NextResponse.json(
        { error: 'calendar_id and discord_channel_id are required' },
        { status: 400 }
      );
    }

    // Verify Discord channel belongs to user
    const discordChannel = await getDiscordChannel(discord_channel_id);
    if (!discordChannel || discordChannel.user_id !== user.google_user_id) {
      return NextResponse.json({ error: 'Discord channel not found' }, { status: 404 });
    }

    // Create subscription
    const subscription = await createCalendarSubscription({
      user_id: user.google_user_id,
      calendar_id,
      calendar_summary: calendar_summary || calendar_id,
      discord_channel_id,
      active: true,
      notify_new_events,
      notify_updates,
      notify_cancellations,
      notify_window_minutes,
    });

    // Get base URL for webhook
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // Set up watch channel (wait for it to complete so subscription is immediately active)
    // This is fast - just a single Google API call
    try {
      await setupWatchChannel(subscription.id, baseUrl);
      console.log(`[Subscribe] Watch channel setup completed for ${subscription.id}`);
    } catch (error) {
      console.error(`[Subscribe] Error setting up watch channel for ${subscription.id}:`, error);
      // Return error since watch channel is critical for notifications
      return NextResponse.json(
        { error: 'Failed to setup calendar notifications. Please try again.' },
        { status: 500 }
      );
    }

    // Return after watch channel is active - notifications will work immediately
    return NextResponse.json({
      subscription,
      message: 'Subscription created successfully! You will receive notifications for all calendar events.'
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
