import { NextResponse } from 'next/server';
import { findSubscriptionByGoogleChannel, getCalendarSubscription } from '@/app/lib/redis';
import { syncSubscription } from '@/app/lib/sync';

export const runtime = 'nodejs'; // Not Edge runtime

export async function POST(request: Request) {
  const startTime = Date.now();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔔 [Webhook] Received Google Calendar push notification');

  try {
    const headers = request.headers;
    const channelId = headers.get('X-Goog-Channel-ID');
    const resourceId = headers.get('X-Goog-Resource-ID');
    const resourceState = headers.get('X-Goog-Resource-State');
    const messageNumber = headers.get('X-Goog-Message-Number');
    const channelToken = headers.get('X-Goog-Channel-Token');
    const channelExpiration = headers.get('X-Goog-Channel-Expiration');

    console.log('[Webhook] Headers:', {
      channelId,
      resourceId,
      resourceState,
      messageNumber,
      channelToken,
      channelExpiration: channelExpiration ? new Date(channelExpiration).toISOString() : 'none',
    });

    if (!channelId || !resourceId) {
      console.error('[Webhook] ❌ Missing required headers');
      return NextResponse.json({ error: 'Missing required headers' }, { status: 400 });
    }

    // Find subscription by channel ID
    console.log(`[Webhook] Looking up subscription for channel: ${channelId}`);
    const subscription = await findSubscriptionByGoogleChannel(channelId);

    if (!subscription) {
      console.warn(`[Webhook] ⚠️  Subscription not found for channel ID: ${channelId}`);
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    console.log('[Webhook] ✅ Found subscription:', {
      id: subscription.id,
      calendar_id: subscription.calendar_id,
      calendar_summary: subscription.calendar_summary,
      active: subscription.active,
      user_id: subscription.user_id,
    });

    // Verify resource ID matches
    if (subscription.google_resource_id !== resourceId) {
      console.error('[Webhook] ❌ Resource ID mismatch', {
        subscriptionId: subscription.id,
        expected: subscription.google_resource_id,
        received: resourceId,
      });
      return NextResponse.json({ error: 'Resource ID mismatch' }, { status: 400 });
    }

    console.log(`[Webhook] ✅ Resource ID verified: ${resourceId}`);

    // Handle different resource states
    if (resourceState === 'sync' || resourceState === 'exists') {
      console.log(`[Webhook] 🔄 Triggering sync for subscription ${subscription.id} (state: ${resourceState})`);

      // Trigger sync asynchronously
      syncSubscription(subscription.id)
        .then(() => {
          const duration = Date.now() - startTime;
          console.log(`[Webhook] ✅ Sync completed for ${subscription.id} in ${duration}ms`);
        })
        .catch((error) => {
          console.error(`[Webhook] ❌ Error syncing subscription ${subscription.id}:`, error);
          if (error instanceof Error) {
            console.error('[Webhook] Error details:', {
              message: error.message,
              stack: error.stack,
            });
          }
        });
    } else if (resourceState === 'not_exists') {
      console.warn(`[Webhook] ⚠️  Watch channel not_exists for subscription ${subscription.id} - needs renewal`);
    } else {
      console.log(`[Webhook] ℹ️  Unknown resource state: ${resourceState}`);
    }

    const responseTime = Date.now() - startTime;
    console.log(`[Webhook] ✅ Webhook processed in ${responseTime}ms, returning 200 OK`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Always return 200 immediately
    return NextResponse.json({ received: true, subscriptionId: subscription.id });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[Webhook] ❌ Error processing webhook (${responseTime}ms):`, error);

    if (error instanceof Error) {
      console.error('[Webhook] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Still return 200 to prevent Google from retrying
    return NextResponse.json({ error: 'Internal error' }, { status: 200 });
  }
}
