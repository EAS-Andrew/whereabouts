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

    // Perform initial sync
    try {
      await performInitialSync(subscription.id);
    } catch (error) {
      console.error('Error during initial sync:', error);
      // Continue anyway - we can sync later
    }

    // Set up watch channel
    try {
      await setupWatchChannel(subscription.id, baseUrl);
    } catch (error) {
      console.error('Error setting up watch channel:', error);
      // Continue anyway - user can retry later
    }

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
