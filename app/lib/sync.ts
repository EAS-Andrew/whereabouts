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
  const subscription = await getCalendarSubscription(subscriptionId);
  if (!subscription) {
    throw new Error(`Subscription not found: ${subscriptionId}`);
  }

  const user = await getUser(subscription.user_id);
  if (!user) {
    throw new Error(`User not found for subscription ${subscriptionId}: ${subscription.user_id}`);
  }

  // Perform initial sync - get events from now going forward
  const timeMin = new Date().toISOString();

  let nextPageToken: string | null | undefined;
  let nextSyncToken: string | null | undefined;

  do {
    const result = await listEvents(user.google_user_id, subscription.calendar_id, {
      timeMin,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      ...(nextPageToken && { pageToken: nextPageToken }),
    });

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
    console.log(`[performInitialSync] Completed initial sync for subscription ${subscriptionId}, cached ${result.items.length} events`);
  } else {
    console.warn(`[performInitialSync] No sync token received for subscription ${subscriptionId}`);
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
  const subscription = await getCalendarSubscription(subscriptionId);
  if (!subscription || !subscription.active) {
    return;
  }

  if (!subscription.sync_token) {
    // No sync token yet, perform initial sync
    await performInitialSync(subscriptionId);
    return;
  }

  const user = await getUser(subscription.user_id);
  if (!user) {
    throw new Error('User not found');
  }

  let result;
  try {
    // Use syncToken for incremental sync
    result = await listEvents(user.google_user_id, subscription.calendar_id, {
      syncToken: subscription.sync_token,
    });
  } catch (error: any) {
    // If sync token is invalid (410 error), clear it and do full sync
    if (error.code === 410 || error.message?.includes('Sync token') || error.message?.includes('410')) {
      console.log(`Sync token invalid for subscription ${subscriptionId}, performing full sync`);
      await updateCalendarSubscription(subscriptionId, { sync_token: undefined });
      await performInitialSync(subscriptionId);
      return;
    }
    throw error;
  }

  const changes: EventChange[] = [];

  // Process each event
  for (const event of result.items) {
    const change = await detectEventChange(event, subscriptionId);

    if (change) {
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

  // Filter and send notifications
  const notificationsToSend = changes.filter(change =>
    shouldNotifyForChange(change, subscription)
  );

  console.log(`[syncSubscription] Subscription ${subscriptionId}: ${changes.length} changes detected, ${notificationsToSend.length} notifications to send`);

  // Get Discord channel
  const discordChannel = await import('./redis').then(m =>
    m.getDiscordChannel(subscription.discord_channel_id)
  );

  if (discordChannel) {
    // Send notifications
    for (const change of notificationsToSend) {
      const payload = formatEventChangeForDiscord(change, subscription.calendar_summary);

      const result = await postToDiscordWithRetry(discordChannel.webhook_url, payload);

      if (!result.success) {
        console.error(
          `[syncSubscription] Failed to send Discord notification for subscription ${subscriptionId}:`,
          result.error
        );
      } else {
        console.log(`[syncSubscription] Sent ${change.type} notification for event: ${change.event.summary}`);
      }
    }
  } else {
    console.warn(`[syncSubscription] Discord channel not found for subscription ${subscriptionId}: ${subscription.discord_channel_id}`);
  }

  // Update sync token
  if (result.nextSyncToken) {
    await updateCalendarSubscription(subscriptionId, {
      sync_token: result.nextSyncToken,
      last_sync_at: new Date().toISOString(),
    });
  }
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
