import { Redis } from '@upstash/redis';
import { v4 as uuidv4 } from 'uuid';
import type {
  User,
  DiscordChannel,
  CalendarSubscription,
  CachedEvent,
} from './types';
import { encrypt, decrypt } from './encryption';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('Upstash Redis credentials are required');
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// User functions
export async function createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const user: User = {
    id,
    ...userData,
    access_token: encrypt(userData.access_token),
    refresh_token: encrypt(userData.refresh_token),
    created_at: now,
    updated_at: now,
  };

  await redis.hset(`user:${user.google_user_id}`, user);
  await redis.set(`users:by_email:${user.email}`, user.google_user_id);
  
  return user;
}

export async function getUser(googleUserId: string): Promise<User | null> {
  const userData = await redis.hgetall(`user:${googleUserId}`);
  if (!userData || Object.keys(userData).length === 0) return null;
  
  const user = userData as unknown as User;
  return {
    ...user,
    access_token: decrypt(user.access_token),
    refresh_token: decrypt(user.refresh_token),
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const googleUserId = await redis.get<string>(`users:by_email:${email}`);
  if (!googleUserId) return null;
  return getUser(googleUserId);
}

export async function updateUser(googleUserId: string, updates: Partial<User>): Promise<User> {
  const existing = await getUser(googleUserId);
  if (!existing) throw new Error('User not found');
  
  const updated: User = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  
  if (updates.access_token) {
    updated.access_token = encrypt(updates.access_token);
  }
  if (updates.refresh_token) {
    updated.refresh_token = encrypt(updates.refresh_token);
  }
  
  await redis.hset(`user:${googleUserId}`, updated);
  
  return {
    ...updated,
    access_token: updates.access_token || existing.access_token,
    refresh_token: updates.refresh_token || existing.refresh_token,
  };
}

// Discord Channel functions
export async function createDiscordChannel(
  channelData: Omit<DiscordChannel, 'id' | 'created_at' | 'updated_at'>
): Promise<DiscordChannel> {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const channel: DiscordChannel = {
    id,
    ...channelData,
    webhook_url: encrypt(channelData.webhook_url),
    created_at: now,
    updated_at: now,
  };

  await redis.hset(`discord_channel:${id}`, channel);
  await redis.sadd(`user:${channel.user_id}:discord_channels`, id);
  
  return {
    ...channel,
    webhook_url: channelData.webhook_url, // return decrypted
  };
}

export async function getDiscordChannel(channelId: string): Promise<DiscordChannel | null> {
  const channelData = await redis.hgetall(`discord_channel:${channelId}`);
  if (!channelData || Object.keys(channelData).length === 0) return null;
  
  const channel = channelData as unknown as DiscordChannel;
  return {
    ...channel,
    webhook_url: decrypt(channel.webhook_url),
  };
}

export async function listUserDiscordChannels(userId: string): Promise<DiscordChannel[]> {
  const channelIds = await redis.smembers<string[]>(`user:${userId}:discord_channels`);
  if (!channelIds || channelIds.length === 0) return [];
  
  const channels = await Promise.all(
    channelIds.map(id => getDiscordChannel(id))
  );
  
  return channels.filter((c): c is DiscordChannel => c !== null);
}

// Calendar Subscription functions
export async function createCalendarSubscription(
  subscriptionData: Omit<CalendarSubscription, 'id' | 'created_at' | 'updated_at'>
): Promise<CalendarSubscription> {
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const subscription: CalendarSubscription = {
    id,
    ...subscriptionData,
    created_at: now,
    updated_at: now,
  };

  await redis.hset(`calendar_subscription:${id}`, subscription);
  await redis.sadd(`user:${subscription.user_id}:calendar_subscriptions`, id);
  
  if (subscription.google_channel_id) {
    await redis.set(`google_channel:${subscription.google_channel_id}`, id);
  }
  
  return subscription;
}

export async function getCalendarSubscription(subscriptionId: string): Promise<CalendarSubscription | null> {
  const subData = await redis.hgetall(`calendar_subscription:${subscriptionId}`);
  if (!subData || Object.keys(subData).length === 0) return null;
  
  return subData as unknown as CalendarSubscription;
}

export async function listUserSubscriptions(userId: string): Promise<CalendarSubscription[]> {
  const subscriptionIds = await redis.smembers<string[]>(`user:${userId}:calendar_subscriptions`);
  if (!subscriptionIds || subscriptionIds.length === 0) return [];
  
  const subscriptions = await Promise.all(
    subscriptionIds.map(id => getCalendarSubscription(id))
  );
  
  return subscriptions.filter((s): s is CalendarSubscription => s !== null);
}

export async function findSubscriptionByGoogleChannel(googleChannelId: string): Promise<CalendarSubscription | null> {
  const subscriptionId = await redis.get<string>(`google_channel:${googleChannelId}`);
  if (!subscriptionId) return null;
  return getCalendarSubscription(subscriptionId);
}

export async function updateCalendarSubscription(
  subscriptionId: string,
  updates: Partial<CalendarSubscription>
): Promise<CalendarSubscription> {
  const existing = await getCalendarSubscription(subscriptionId);
  if (!existing) throw new Error('Subscription not found');
  
  const updated: CalendarSubscription = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  
  await redis.hset(`calendar_subscription:${subscriptionId}`, updated);
  
  // Update google_channel mapping if it changed
  if (updates.google_channel_id && updates.google_channel_id !== existing.google_channel_id) {
    if (existing.google_channel_id) {
      await redis.del(`google_channel:${existing.google_channel_id}`);
    }
    await redis.set(`google_channel:${updates.google_channel_id}`, subscriptionId);
  }
  
  return updated;
}

// Event Cache functions
export async function cacheEvent(
  subscriptionId: string,
  event: CachedEvent
): Promise<void> {
  const key = `event_cache:${subscriptionId}:${event.event_id}`;
  await redis.hset(key, event);
  await redis.expire(key, 30 * 24 * 60 * 60); // 30 days TTL
  await redis.sadd(`subscription:${subscriptionId}:events`, event.event_id);
}

export async function getCachedEvent(
  subscriptionId: string,
  eventId: string
): Promise<CachedEvent | null> {
  const eventData = await redis.hgetall(`event_cache:${subscriptionId}:${eventId}`);
  if (!eventData || Object.keys(eventData).length === 0) return null;
  
  return eventData as unknown as CachedEvent;
}

export async function clearEventCache(subscriptionId: string): Promise<void> {
  const eventIds = await redis.smembers<string[]>(`subscription:${subscriptionId}:events`);
  if (eventIds && eventIds.length > 0) {
    await Promise.all(
      eventIds.map(id => redis.del(`event_cache:${subscriptionId}:${id}`))
    );
  }
  await redis.del(`subscription:${subscriptionId}:events`);
}

// Helper to get subscriptions expiring soon (for cron)
export async function getSubscriptionsExpiringSoon(hoursAhead: number = 6): Promise<CalendarSubscription[]> {
  const now = Date.now();
  const threshold = now + (hoursAhead * 60 * 60 * 1000);
  
  // This is a simplified approach - in production you might want to use Redis sorted sets
  // For MVP, we'll scan active subscriptions and filter
  // Note: This requires getting all subscriptions, which may not scale
  // For production, consider using Redis sorted sets indexed by expiration time
  
  // For now, return empty array - this will be called from cron job
  // that can iterate through all active subscriptions
  return [];
}

export { redis };
