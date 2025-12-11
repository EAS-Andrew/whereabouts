import { v4 as uuidv4 } from 'uuid';
import {
  getCalendarSubscription,
  updateCalendarSubscription,
  cacheEvent,
  getCachedEvent,
  listUserSubscriptions,
} from './redis';
import { listEvents, watchCalendar, stopWatchChannel } from './google-calendar';
import { getUser } from './redis';
import { postToDiscordWithRetry } from './discord';
import { formatEventChangeForDiscord } from './message-formatting';
import type { EventChange, GoogleCalendarEvent } from './types';

export async function performInitialSync(subscriptionId: string): Promise<void> {
  console.log(`[performInitialSync] Starting initial sync for subscription ${subscriptionId}`);

  try {
    const subscription = await getCalendarSubscription(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }
    console.log(`[performInitialSync] Subscription found: ${subscription.calendar_summary}`);

    const user = await getUser(subscription.user_id);
    if (!user) {
      throw new Error(`User not found for subscription ${subscriptionId}: ${subscription.user_id}`);
    }
    console.log(`[performInitialSync] User found: ${user.email}`);

    // Perform initial sync - get events from now going forward
    const timeMin = new Date().toISOString();
    console.log(`[performInitialSync] Fetching events from: ${timeMin}`);

    let nextPageToken: string | null | undefined;
    let nextSyncToken: string | null | undefined;
    let totalEventsCached = 0;

    do {
      console.log(`[performInitialSync] Fetching events page (token: ${nextPageToken || 'first page'})...`);

      const result = await listEvents(user.google_user_id, subscription.calendar_id, {
        timeMin,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        ...(nextPageToken && { pageToken: nextPageToken }),
      });

      console.log(`[performInitialSync] Received ${result.items.length} events`);

      // Cache all events
      for (const event of result.items) {
        await cacheEvent(subscriptionId, {
          event_id: event.id,
          etag: event.etag,
          start_time: event.start?.dateTime || event.start?.date || '',
          end_time: event.end?.dateTime || event.end?.date || '',
          summary: event.summary || '',
          location: event.location || '',
          status: event.status,
          last_seen_at: new Date().toISOString(),
        });
        totalEventsCached++;
      }

      nextPageToken = result.nextPageToken;
      if (result.nextSyncToken) {
        nextSyncToken = result.nextSyncToken;
      }
    } while (nextPageToken);

    // Store sync token
    if (nextSyncToken) {
      await updateCalendarSubscription(subscriptionId, {
        sync_token: nextSyncToken,
        last_sync_at: new Date().toISOString(),
      });
      console.log(`[performInitialSync] ✅ Completed initial sync for subscription ${subscriptionId}, cached ${totalEventsCached} events`);
    } else {
      console.warn(`[performInitialSync] ⚠️  No sync token received for subscription ${subscriptionId}`);
    }
  } catch (error) {
    console.error(`[performInitialSync] ❌ Fatal error during initial sync for ${subscriptionId}:`, error);
    if (error instanceof Error) {
      console.error(`[performInitialSync] Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
    throw error; // Re-throw to let caller handle
  }
}

export async function setupWatchChannel(
  subscriptionId: string,
  baseUrl: string
): Promise<void> {
  console.log(`[setupWatchChannel] Setting up watch channel for subscription ${subscriptionId}`);
  const subscription = await getCalendarSubscription(subscriptionId);
  if (!subscription) {
    throw new Error(`Subscription not found: ${subscriptionId}`);
  }

  const user = await getUser(subscription.user_id);
  if (!user) {
    throw new Error(`User not found for subscription ${subscriptionId}: ${subscription.user_id}`);
  }

  // Stop existing channel if any
  if (subscription.google_channel_id && subscription.google_resource_id) {
    try {
      await stopWatchChannel(
        user.google_user_id,
        subscription.google_resource_id,
        subscription.google_channel_id
      );
    } catch (error) {
      console.error('Error stopping existing channel:', error);
      // Continue anyway
    }
  }

  // Create new watch channel
  const googleChannelId = uuidv4();
  const webhookUrl = `${baseUrl}/api/google-calendar/webhook`;

  const watchResult = await watchCalendar(
    user.google_user_id,
    subscription.calendar_id,
    googleChannelId,
    webhookUrl
  );

  await updateCalendarSubscription(subscriptionId, {
    google_channel_id: googleChannelId,
    google_resource_id: watchResult.resourceId || undefined,
    google_channel_expiration: watchResult.expiration,
  });

  const expirationDate = watchResult.expiration ? new Date(watchResult.expiration) : 'unknown';
  console.log(`[setupWatchChannel] Watch channel established for subscription ${subscriptionId}, expires: ${expirationDate}`);
}

export async function syncSubscription(subscriptionId: string): Promise<void> {
  console.log(`[syncSubscription] 🔄 Starting sync for subscription: ${subscriptionId}`);

  const subscription = await getCalendarSubscription(subscriptionId);
  if (!subscription) {
    console.warn(`[syncSubscription] ⚠️  Subscription not found: ${subscriptionId}`);
    return;
  }

  if (!subscription.active) {
    console.log(`[syncSubscription] ⏸️  Subscription inactive: ${subscriptionId}`);
    return;
  }

  console.log(`[syncSubscription] Subscription details:`, {
    id: subscription.id,
    calendar: subscription.calendar_summary,
    has_sync_token: !!subscription.sync_token,
    user_id: subscription.user_id,
  });

  // Simplified: We always just fetch today's events, no need for sync tokens

  console.log(`[syncSubscription] 🔍 Looking up user: ${subscription.user_id}`);
  const user = await getUser(subscription.user_id);
  if (!user) {
    console.error(`[syncSubscription] ❌ User not found: ${subscription.user_id}`);
    throw new Error('User not found');
  }
  console.log(`[syncSubscription] ✅ User found: ${user.email}`);

  let result;
  try {
    // SIMPLE: Always just get TODAY's events (that's all we need!)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    console.log(`[syncSubscription] 📡 Fetching TODAY's events (${todayStart.toISOString()} to ${todayEnd.toISOString()})`);
    
    result = await listEvents(user.google_user_id, subscription.calendar_id, {
      timeMin: todayStart.toISOString(),
      timeMax: todayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    console.log(`[syncSubscription] ✅ Received ${result.items.length} events for today from Google`);
  } catch (error: any) {
    // If sync token is invalid (410 error), clear it and retry without token
    if (error.code === 410 || error.message?.includes('Sync token') || error.message?.includes('410')) {
      console.warn(`[syncSubscription] ⚠️  Sync token invalid for subscription ${subscriptionId}, clearing and retrying`);
      await updateCalendarSubscription(subscriptionId, { sync_token: undefined });
      // Retry this same sync without the token
      const timeMin = new Date().toISOString();
      result = await listEvents(user.google_user_id, subscription.calendar_id, {
        timeMin,
        singleEvents: true,
        orderBy: 'startTime',
      });
      console.log(`[syncSubscription] ✅ Retry succeeded, received ${result.items.length} events`);
    } else {
      console.error(`[syncSubscription] ❌ Error fetching events:`, error);
      throw error;
    }
  }

  const changes: EventChange[] = [];

  console.log(`[syncSubscription] 🔍 Processing ${result.items.length} events for today...`);

  // SIMPLE: Detect changes for today's events only
  for (const event of result.items) {
    // Use change detection (will detect new/updated/cancelled)
    const change = await detectEventChange(event, subscriptionId);

    if (change) {
      console.log(`[syncSubscription] 📝 Change detected:`, {
        type: change.type,
        event: event.summary || event.id,
        status: event.status,
      });
      changes.push(change);
    }

    // Update cache
    if (event.status !== 'cancelled') {
      await cacheEvent(subscriptionId, {
        event_id: event.id,
        etag: event.etag,
        start_time: event.start?.dateTime || event.start?.date || '',
        end_time: event.end?.dateTime || event.end?.date || '',
        summary: event.summary || '',
        location: event.location || '',
        status: event.status,
        last_seen_at: new Date().toISOString(),
      });
    }
  }

  console.log(`[syncSubscription] ✅ Finished processing ${result.items.length} events`);

  console.log(`[syncSubscription] 📊 Summary: ${changes.length} total changes detected (${isFirstSync ? 'first sync - all events treated as new' : 'incremental sync'})`);

  // Filter and send notifications
  const notificationsToSend = changes.filter(change => {
    const shouldNotify = shouldNotifyForChange(change, subscription);
    if (!shouldNotify) {
      console.log(`[syncSubscription] ⏭️  Skipping notification for ${change.type} event "${change.event.summary || change.event.id}" (filtered by settings)`);
    }
    return shouldNotify;
  });

  console.log(`[syncSubscription] 📬 ${notificationsToSend.length} notifications will be sent (filtered from ${changes.length} changes)`);

  // Get Discord channel
  console.log(`[syncSubscription] 🔍 Looking up Discord channel: ${subscription.discord_channel_id}`);
  const discordChannel = await import('./redis').then(m =>
    m.getDiscordChannel(subscription.discord_channel_id)
  );

  if (!discordChannel) {
    console.error(`[syncSubscription] ❌ Discord channel not found: ${subscription.discord_channel_id}`);
  } else {
    console.log(`[syncSubscription] ✅ Discord channel found: ${discordChannel.name || discordChannel.id}`);

    // Send notifications
    for (const change of notificationsToSend) {
      console.log(`[syncSubscription] 📤 Sending Discord notification for: ${change.event.summary}`);
      const payload = formatEventChangeForDiscord(change, subscription.calendar_summary);

      const result = await postToDiscordWithRetry(discordChannel.webhook_url, payload);

      if (!result.success) {
        console.error(
          `[syncSubscription] Failed to send Discord notification for subscription ${subscriptionId}:`,
          result.error
        );
      } else {
        console.log(`[syncSubscription] ✅ Sent ${change.type} notification for event: ${change.event.summary}`);
      }
    }
  }

  // Update last sync time (we don't need sync tokens since we always query by date range)
  await updateCalendarSubscription(subscriptionId, {
    last_sync_at: new Date().toISOString(),
  });
  console.log(`[syncSubscription] ✅ Updated last sync time for subscription ${subscriptionId}`);

  console.log(`[syncSubscription] ✅ Sync completed for subscription ${subscriptionId}`);
}

async function detectEventChange(
  event: GoogleCalendarEvent,
  subscriptionId: string
): Promise<EventChange | null> {
  const cached = await getCachedEvent(subscriptionId, event.id);
  if (event.status === 'cancelled') {
    return {
      type: 'cancelled',
      event,
      previousEvent: cached || undefined,
    };
  }

  if (!cached) {
    // New event
    return {
      type: 'new',
      event,
    };
  }

  // Check for changes
  const changes: string[] = [];

  if (event.summary !== cached.summary) {
    changes.push('summary');
  }

  if (
    (event.start?.dateTime || event.start?.date) !== cached.start_time ||
    (event.end?.dateTime || event.end?.date) !== cached.end_time
  ) {
    changes.push('time');
  }

  if (event.location !== cached.location) {
    changes.push('location');
  }

  if (changes.length > 0) {
    return {
      type: 'updated',
      event,
      previousEvent: cached,
      changes,
    };
  }

  return null;
}

function shouldNotifyForChange(
  change: EventChange,
  subscription: NonNullable<Awaited<ReturnType<typeof getCalendarSubscription>>>
): boolean {
  // Cancelled events always notify if enabled
  if (change.type === 'cancelled') {
    return subscription.notify_cancellations;
  }

  // New events
  if (change.type === 'new') {
    if (!subscription.notify_new_events) return false;

    // Check notify_window_minutes
    if (subscription.notify_window_minutes > 0 && change.event.start) {
      const startTime = change.event.start.dateTime
        ? new Date(change.event.start.dateTime)
        : change.event.start.date
          ? new Date(change.event.start.date + 'T00:00:00')
          : null;

      if (startTime) {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + subscription.notify_window_minutes * 60 * 1000);

        // Only notify if event is within the window
        if (startTime > windowEnd) {
          return false;
        }
      }
    }

    return true;
  }

  // Updated events
  if (change.type === 'updated') {
    if (!subscription.notify_updates) return false;

    // Check if any change is time-related
    const hasTimeChange = change.changes?.includes('time') || false;

    // Apply notify_window_minutes for time changes
    if (hasTimeChange && subscription.notify_window_minutes > 0 && change.event.start) {
      const startTime = change.event.start.dateTime
        ? new Date(change.event.start.dateTime)
        : change.event.start.date
          ? new Date(change.event.start.date + 'T00:00:00')
          : null;

      if (startTime) {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + subscription.notify_window_minutes * 60 * 1000);

        if (startTime > windowEnd) {
          return false;
        }
      }
    }

    return true;
  }

  return false;
}
