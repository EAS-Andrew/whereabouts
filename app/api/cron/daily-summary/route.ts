import { NextResponse } from 'next/server';
import { redis } from '@/app/lib/redis';
import { getGoogleCalendarClient } from '@/app/lib/google-calendar';
import { decrypt } from '@/app/lib/encryption';
import { postToDiscordWithRetry } from '@/app/lib/discord';

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

        const events = response.data.items || [];
        console.log(`[Daily Summary] Found ${events.length} events for today`);

        if (events.length === 0) {
          // Optional: Send "No events today" message
          console.log(`[Daily Summary] No events today for ${subData.calendar_summary}, skipping notification`);
          continue;
        }

        // Format the daily summary
        const embed = {
          title: `📅 Today's Events - ${subData.calendar_summary}`,
          description: `You have ${events.length} event${events.length > 1 ? 's' : ''} scheduled for today`,
          color: 0x4285f4, // Google Calendar blue
          fields: events.map(event => {
            const start = event.start?.dateTime || event.start?.date;
            const end = event.end?.dateTime || event.end?.date;
            
            let timeStr = '';
            if (start) {
              const startTime = new Date(start);
              if (event.start?.dateTime) {
                // Has specific time
                timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                if (end) {
                  const endTime = new Date(end);
                  timeStr += ` - ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                }
              } else {
                // All-day event
                timeStr = 'All day';
              }
            }

            return {
              name: event.summary || '(No title)',
              value: [
                `🕐 ${timeStr}`,
                event.location ? `📍 ${event.location}` : '',
                event.description ? `📝 ${event.description.substring(0, 100)}${event.description.length > 100 ? '...' : ''}` : '',
              ].filter(Boolean).join('\n'),
              inline: false,
            };
          }),
          footer: {
            text: `Daily Summary • ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
          },
          timestamp: new Date().toISOString(),
        };

        // Send to Discord
        const result = await postToDiscordWithRetry(webhookUrl, {
          embeds: [embed],
        });

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
