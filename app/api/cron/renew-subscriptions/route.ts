import { NextResponse } from 'next/server';
import { getSubscriptionsExpiringSoon } from '@/app/lib/redis';
import { setupWatchChannel } from '@/app/lib/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verify this is called from Vercel Cron
function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  try {
    // Verify cron secret if set
    if (process.env.CRON_SECRET && !verifyCronAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://your-app.vercel.app';

    // Get subscriptions expiring soon
    const subscriptions = await getSubscriptionsExpiringSoon(6);

    const renewed: string[] = [];
    const errors: Array<{ subscriptionId: string; error: string }> = [];

    // Renew each subscription
    for (const subscription of subscriptions) {
      try {
        await setupWatchChannel(subscription.id, baseUrl);
        renewed.push(subscription.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ subscriptionId: subscription.id, error: errorMessage });
        console.error(`Error renewing subscription ${subscription.id}:`, error);
      }
    }

    return NextResponse.json({
      message: 'Renewal check completed',
      renewed: renewed.length,
      errors: errors.length,
      details: {
        renewed,
        errors,
      },
    });
  } catch (error) {
    console.error('Error in renew-subscriptions cron:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
