'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface CalendarSubscription {
  id: string;
  calendar_summary: string;
  active: boolean;
  notify_new_events: boolean;
  notify_updates: boolean;
  notify_cancellations: boolean;
  notify_window_minutes: number;
  last_sync_at?: string;
  google_channel_expiration?: number;
}

export function SubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  async function loadSubscriptions() {
    try {
      const response = await fetch('/api/subscriptions');
      if (!response.ok) {
        throw new Error('Failed to load subscriptions');
      }

      const data = await response.json();
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(subscriptionId: string, currentActive: boolean) {
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active: !currentActive }),
      });

      if (!response.ok) {
        throw new Error('Failed to update subscription');
      }

      loadSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subscription');
    }
  }

  async function handleDelete(subscriptionId: string) {
    if (!confirm('Are you sure you want to delete this subscription?')) {
      return;
    }

    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete subscription');
      }

      loadSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subscription');
    }
  }

  if (loading) {
    return <div className="text-gray-600 dark:text-gray-400">Loading subscriptions...</div>;
  }

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-md bg-gray-50 dark:bg-gray-700/50 p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">No active subscriptions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {subscriptions.map((subscription) => {
          const expirationWarning =
            subscription.google_channel_expiration &&
            subscription.google_channel_expiration < Date.now() + 6 * 60 * 60 * 1000;

          return (
            <div
              key={subscription.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700/50 p-4 shadow-sm dark:shadow-gray-950"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      {subscription.calendar_summary}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        subscription.active
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {subscription.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Notifications:</span>{' '}
                      {[
                        subscription.notify_new_events && 'New',
                        subscription.notify_updates && 'Updates',
                        subscription.notify_cancellations && 'Cancellations',
                      ]
                        .filter(Boolean)
                        .join(', ') || 'None'}
                    </div>

                    {subscription.notify_window_minutes > 0 && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Window:</span>{' '}
                        {subscription.notify_window_minutes} minutes
                      </div>
                    )}

                    {subscription.last_sync_at && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Last sync:</span>{' '}
                        {formatDistanceToNow(new Date(subscription.last_sync_at), {
                          addSuffix: true,
                        })}
                      </div>
                    )}

                    {expirationWarning && subscription.active && (
                      <div className="text-yellow-600 dark:text-yellow-400 font-medium">
                        ⚠️ Watch channel expiring soon
                      </div>
                    )}
                  </div>
                </div>

                <div className="ml-4 flex space-x-2">
                  <button
                    onClick={() =>
                      handleToggleActive(subscription.id, subscription.active)
                    }
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  >
                    {subscription.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(subscription.id)}
                    className="rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-gray-700 px-3 py-1 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
