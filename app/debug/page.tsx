'use client';

import { useState, useEffect } from 'react';

interface Subscription {
  id: string;
  calendar_summary: string;
  calendar_id: string;
  active: boolean;
  sync_token?: string;
  last_sync_at?: string;
  google_channel_id?: string;
  google_resource_id?: string;
  google_channel_expiration?: number;
  notify_new_events: boolean;
  notify_updates: boolean;
  notify_cancellations: boolean;
  notify_window_minutes: number;
}

interface DebugInfo {
  subscriptions: Subscription[];
  error?: string;
}

export default function DebugPage() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadDebugInfo();
  }, []);

  async function loadDebugInfo() {
    try {
      const response = await fetch('/api/debug/subscriptions');
      if (!response.ok) throw new Error('Failed to load debug info');
      const data = await response.json();
      setDebugInfo(data);
    } catch (error) {
      setDebugInfo({ subscriptions: [], error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }

  async function triggerSync(subscriptionId: string) {
    setActionLoading(`sync-${subscriptionId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/debug/sync/${subscriptionId}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed');
      setMessage({ type: 'success', text: `Sync triggered for ${subscriptionId}` });
      setTimeout(loadDebugInfo, 2000); // Reload after 2 seconds
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to trigger sync' });
    } finally {
      setActionLoading(null);
    }
  }

  async function triggerDailySummary() {
    setActionLoading('daily-summary');
    setMessage(null);
    try {
      const response = await fetch('/api/debug/daily-summary', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Daily summary failed');
      setMessage({ type: 'success', text: 'Daily summary triggered' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to trigger daily summary' });
    } finally {
      setActionLoading(null);
    }
  }

  async function refreshWatchChannel(subscriptionId: string) {
    setActionLoading(`refresh-${subscriptionId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/debug/refresh-watch/${subscriptionId}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Refresh failed');
      setMessage({ type: 'success', text: `Watch channel refreshed for ${subscriptionId}` });
      setTimeout(loadDebugInfo, 2000);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to refresh watch channel' });
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-gray-600 dark:text-gray-400">Loading debug info...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🐛 Debug Dashboard</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Monitor subscriptions and trigger manual actions
            </p>
          </div>
          <button
            onClick={loadDebugInfo}
            className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div
            className={`p-4 rounded-md ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Manual Actions</h2>
          <div className="space-x-4">
            <button
              onClick={triggerDailySummary}
              disabled={actionLoading === 'daily-summary'}
              className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50"
            >
              {actionLoading === 'daily-summary' ? 'Triggering...' : 'Trigger Daily Summary'}
            </button>
          </div>
        </div>

        {debugInfo?.error && (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md text-red-800 dark:text-red-200">
            Error: {debugInfo.error}
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Subscriptions ({debugInfo?.subscriptions.length || 0})
          </h2>

          {debugInfo?.subscriptions.length === 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-md text-yellow-800 dark:text-yellow-200">
              No subscriptions found
            </div>
          )}

          {debugInfo?.subscriptions.map((sub) => {
            const expirationDate = sub.google_channel_expiration
              ? new Date(sub.google_channel_expiration)
              : null;
            const isExpiringSoon =
              expirationDate && expirationDate.getTime() < Date.now() + 6 * 60 * 60 * 1000;
            const isExpired = expirationDate && expirationDate.getTime() < Date.now();

            return (
              <div
                key={sub.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {sub.calendar_summary}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          sub.active
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {sub.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{sub.calendar_id}</p>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => triggerSync(sub.id)}
                      disabled={actionLoading === `sync-${sub.id}`}
                      className="px-3 py-1 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
                    >
                      {actionLoading === `sync-${sub.id}` ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button
                      onClick={() => refreshWatchChannel(sub.id)}
                      disabled={actionLoading === `refresh-${sub.id}`}
                      className="px-3 py-1 text-sm bg-purple-600 dark:bg-purple-500 text-white rounded-md hover:bg-purple-700 dark:hover:bg-purple-600 disabled:opacity-50"
                    >
                      {actionLoading === `refresh-${sub.id}` ? 'Refreshing...' : 'Refresh Watch'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-gray-700 dark:text-gray-300">Sync Token</div>
                    <div className="text-gray-600 dark:text-gray-400">
                      {sub.sync_token ? (
                        <span className="font-mono text-xs">✓ Set</span>
                      ) : (
                        <span className="text-yellow-600 dark:text-yellow-400">✗ Not set</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-medium text-gray-700 dark:text-gray-300">Last Sync</div>
                    <div className="text-gray-600 dark:text-gray-400">
                      {sub.last_sync_at ? (
                        new Date(sub.last_sync_at).toLocaleString()
                      ) : (
                        <span className="text-gray-400">Never</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-medium text-gray-700 dark:text-gray-300">Watch Channel</div>
                    <div className="text-gray-600 dark:text-gray-400">
                      {sub.google_channel_id ? (
                        <span className="font-mono text-xs">✓ {sub.google_channel_id.substring(0, 8)}...</span>
                      ) : (
                        <span className="text-yellow-600 dark:text-yellow-400">✗ Not set</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-medium text-gray-700 dark:text-gray-300">Expiration</div>
                    <div className="text-gray-600 dark:text-gray-400">
                      {expirationDate ? (
                        <span
                          className={
                            isExpired
                              ? 'text-red-600 dark:text-red-400'
                              : isExpiringSoon
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : ''
                          }
                        >
                          {expirationDate.toLocaleString()}
                          {isExpired && ' (Expired!)'}
                          {isExpiringSoon && !isExpired && ' (Soon!)'}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">Notification Settings</div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded ${
                        sub.notify_new_events
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      New Events: {sub.notify_new_events ? 'ON' : 'OFF'}
                    </span>
                    <span
                      className={`px-2 py-1 rounded ${
                        sub.notify_updates
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Updates: {sub.notify_updates ? 'ON' : 'OFF'}
                    </span>
                    <span
                      className={`px-2 py-1 rounded ${
                        sub.notify_cancellations
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Cancellations: {sub.notify_cancellations ? 'ON' : 'OFF'}
                    </span>
                    <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      Window: {sub.notify_window_minutes} min
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
