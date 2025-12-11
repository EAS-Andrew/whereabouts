import { NextResponse } from 'next/server';
import { getAllActiveSubscriptions } from '@/app/lib/redis';
import { syncSubscription } from '@/app/lib/sync';

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

    // Get all active subscriptions
    const subscriptions = await getAllActiveSubscriptions();

    const synced: string[] = [];
    const errors: Array<{ subscriptionId: string; error: string }> = [];

    // Sync each subscription
    for (const subscription of subscriptions) {
      try {
        await syncSubscription(subscription.id);
        synced.push(subscription.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ subscriptionId: subscription.id, error: errorMessage });
        console.error(`Error syncing subscription ${subscription.id}:`, error);
      }
    }

    return NextResponse.json({
      message: 'Periodic sync completed',
      synced: synced.length,
      errors: errors.length,
      details: {
        synced,
        errors,
      },
    });
  } catch (error) {
    console.error('Error in periodic-sync cron:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
