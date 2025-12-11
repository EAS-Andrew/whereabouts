import { NextResponse } from 'next/server';
import { redis, clearStatusMessageId, setStatusMessageId } from '@/app/lib/redis';
import { getGoogleCalendarClient } from '@/app/lib/google-calendar';
import { decrypt } from '@/app/lib/encryption';
import { postToDiscordWithRetry } from '@/app/lib/discord';
import { buildLocationStatus, formatStatusBoard } from '@/app/lib/location-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verify this is called from Vercel Cron
function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  console.log('[Daily Summary] 🌅 Starting daily summary cron job');

  try {
    // Verify cron secret if set
    if (process.env.CRON_SECRET && !verifyCronAuth(request)) {
      console.error('[Daily Summary] ❌ Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active subscriptions
    const subscriptionKeys = await redis.keys('calendar_subscription:*');
    console.log(`[Daily Summary] Found ${subscriptionKeys.length} subscriptions to process`);

    const summariesSent: string[] = [];
    const errors: Array<{ subscriptionId: string; error: string }> = [];

    // Get today's date range (8am today to 8am tomorrow)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    console.log(`[Daily Summary] Time range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

    for (const key of subscriptionKeys) {
      const subscriptionId = key.replace('calendar_subscription:', '');

      try {
        const subData = await redis.hgetall(key);
        if (!subData || Object.keys(subData).length === 0) continue;

        // Check if subscription is active
        const isActive = (subData.active as any) === 'true' || (subData.active as any) === true;
        if (!isActive) {
          console.log(`[Daily Summary] Skipping inactive subscription: ${subscriptionId}`);
          continue;
        }

        console.log(`[Daily Summary] Processing subscription: ${subscriptionId} (${subData.calendar_summary})`);

        // Get user info
        const userData = await redis.hgetall(`user:${subData.user_id}`);
        if (!userData || Object.keys(userData).length === 0) {
          console.warn(`[Daily Summary] User not found for subscription: ${subscriptionId}`);
          continue;
        }

        // Get Discord channel
        const channelData = await redis.hgetall(`discord_channel:${subData.discord_channel_id}`);
        if (!channelData || Object.keys(channelData).length === 0) {
          console.warn(`[Daily Summary] Discord channel not found: ${subData.discord_channel_id}`);
          continue;
        }

        const webhookUrl = decrypt(channelData.webhook_url as string);

        // Fetch today's events from Google Calendar
        const calendar = await getGoogleCalendarClient(subData.user_id as string);
        const response = await calendar.events.list({
          calendarId: subData.calendar_id as string,
          timeMin: todayStart.toISOString(),
          timeMax: todayEnd.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });

        const events = (response.data.items || []) as any[];
        console.log(`[Daily Summary] Found ${events.length} events for today`);

        // Clear old message ID so we post a fresh one
        await clearStatusMessageId(subscriptionId);
        console.log(`[Daily Summary] Cleared old message ID for new day`);

        // Build location status board
        const statusBoard = buildLocationStatus(events);
        const embed = formatStatusBoard(statusBoard);

        // Post new status message for the day
        const result = await postToDiscordWithRetry(webhookUrl, {
          embeds: [embed],
        });

        if (result.success && result.messageId) {
          await setStatusMessageId(subscriptionId, result.messageId);
        }

        if (result.success) {
          console.log(`[Daily Summary] ✅ Sent daily summary for ${subData.calendar_summary}`);
          summariesSent.push(subscriptionId);
        } else {
          console.error(`[Daily Summary] ❌ Failed to send summary for ${subscriptionId}:`, result.error);
          errors.push({ subscriptionId, error: result.error || 'Unknown error' });
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Daily Summary] ❌ Error processing subscription ${subscriptionId}:`, error);
        errors.push({ subscriptionId, error: errorMessage });
      }
    }

    console.log(`[Daily Summary] ✅ Completed: ${summariesSent.length} sent, ${errors.length} errors`);

    return NextResponse.json({
      message: 'Daily summary cron completed',
      sent: summariesSent.length,
      errors: errors.length,
      details: {
        summariesSent,
        errors,
      },
    });
  } catch (error) {
    console.error('[Daily Summary] ❌ Fatal error in daily summary cron:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
