import { redirect } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import { CalendarList } from '@/app/components/calendar-list';
import { SubscriptionList } from '@/app/components/subscription-list';
import { DiscordWebhookForm } from '@/app/components/discord-webhook-form';

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Connect your Google Calendar to Discord webhooks
          </p>
        </div>

        <div className="space-y-8">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Discord Webhooks</h2>
            <DiscordWebhookForm />
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Calendar Subscriptions</h2>
            <CalendarList />
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Active Subscriptions</h2>
            <SubscriptionList />
          </div>
        </div>
      </div>
    </div>
  );
}
