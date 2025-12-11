import { NextResponse } from 'next/server';
import { findSubscriptionByGoogleChannel, getCalendarSubscription } from '@/app/lib/redis';
import { syncSubscription } from '@/app/lib/sync';

export const runtime = 'nodejs'; // Not Edge runtime

export async function POST(request: Request) {
  try {
    const headers = request.headers;
    const channelId = headers.get('X-Goog-Channel-ID');
    const resourceId = headers.get('X-Goog-Resource-ID');
    const resourceState = headers.get('X-Goog-Resource-State');

    if (!channelId || !resourceId) {
      return NextResponse.json({ error: 'Missing required headers' }, { status: 400 });
    }

    // Find subscription by channel ID
    const subscription = await findSubscriptionByGoogleChannel(channelId);
    if (!subscription) {
      console.warn(`Subscription not found for channel ID: ${channelId}`);
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Verify resource ID matches
    if (subscription.google_resource_id !== resourceId) {
      console.warn(
        `Resource ID mismatch for subscription ${subscription.id}. Expected: ${subscription.google_resource_id}, Got: ${resourceId}`
      );
      return NextResponse.json({ error: 'Resource ID mismatch' }, { status: 400 });
    }

    // Handle different resource states
    if (resourceState === 'sync' || resourceState === 'exists') {
      // Trigger sync asynchronously
      syncSubscription(subscription.id).catch((error) => {
        console.error(`Error syncing subscription ${subscription.id}:`, error);
      });
    } else if (resourceState === 'not_exists') {
      // Channel was deleted/expired - mark subscription as needing renewal
      console.log(`Watch channel not_exists for subscription ${subscription.id}`);
      // We'll handle renewal in the cron job
    }

    // Always return 200 immediately
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to prevent Google from retrying
    return NextResponse.json({ error: 'Internal error' }, { status: 200 });
  }
}
