import { NextResponse } from 'next/server';
import { getSession } from '@/app/lib/auth';
import { redis } from '@/app/lib/redis';
import { getGoogleCalendarClient } from '@/app/lib/google-calendar';
import { decrypt } from '@/app/lib/encryption';
import { postToDiscordWithRetry } from '@/app/lib/discord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's active subscriptions
    const subscriptionKeys = await redis.keys('calendar_subscription:*');
    const subscriptions = [];

    for (const key of subscriptionKeys) {
      const subData = await redis.hgetall(key);
      if (!subData || Object.keys(subData).length === 0) continue;
      if (subData.user_id !== session.user.id) continue;
      if (!((subData.active as any) === 'true' || (subData.active as any) === true)) continue;

      subscriptions.push({
        id: key.replace('calendar_subscription:', ''),
        calendar_summary: subData.calendar_summary,
        calendar_id: subData.calendar_id,
        user_id: subData.user_id,
        discord_channel_id: subData.discord_channel_id,
      });
    }

    if (subscriptions.length === 0) {
      return NextResponse.json({ message: 'No active subscriptions found' });
    }

    // Get today's date range
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const results = [];

    for (const sub of subscriptions) {
      try {
        // Get Discord channel
        const channelData = await redis.hgetall(`discord_channel:${sub.discord_channel_id}`);
        if (!channelData || Object.keys(channelData).length === 0) {
          results.push({ subscriptionId: sub.id, error: 'Discord channel not found' });
          continue;
        }

        const webhookUrl = decrypt(channelData.webhook_url as string);

        // Fetch today's events
        const calendar = await getGoogleCalendarClient(sub.user_id);
        const response = await calendar.events.list({
          calendarId: sub.calendar_id,
          timeMin: todayStart.toISOString(),
          timeMax: todayEnd.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });

        const events = response.data.items || [];

        if (events.length === 0) {
          results.push({ subscriptionId: sub.id, events: 0, message: 'No events today' });
          continue;
        }

        // Format and send
        const embed = {
          title: `📅 Today's Events - ${sub.calendar_summary}`,
          description: `You have ${events.length} event${events.length > 1 ? 's' : ''} scheduled for today`,
          color: 0x4285f4,
          fields: events.map((event: any) => {
            const start = event.start?.dateTime || event.start?.date;
            let timeStr = '';
            if (start) {
              const startTime = new Date(start);
              if (event.start?.dateTime) {
                timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                if (event.end?.dateTime) {
                  const endTime = new Date(event.end.dateTime);
                  timeStr += ` - ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                }
              } else {
                timeStr = 'All day';
              }
            }

            return {
              name: event.summary || '(No title)',
              value: [
                `🕐 ${timeStr}`,
                event.location ? `📍 ${event.location}` : '',
              ].filter(Boolean).join('\n'),
            };
          }),
          footer: {
            text: `Daily Summary • ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
          },
          timestamp: new Date().toISOString(),
        };

        const result = await postToDiscordWithRetry(webhookUrl, { embeds: [embed] });

        if (result.success) {
          results.push({ subscriptionId: sub.id, events: events.length, sent: true });
        } else {
          results.push({ subscriptionId: sub.id, events: events.length, error: result.error });
        }
      } catch (error) {
        results.push({
          subscriptionId: sub.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      message: 'Daily summary triggered',
      results,
    });
  } catch (error) {
    console.error('Error triggering daily summary:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
