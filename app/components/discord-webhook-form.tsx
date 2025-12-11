'use client';

import { useState } from 'react';

export function DiscordWebhookForm() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/discord-channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook_url: webhookUrl,
          name: name || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create Discord webhook');
      }

      setSuccess(true);
      setWebhookUrl('');
      setName('');

      // Refresh the page after a moment to show updated list
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Discord Webhook URL
        </label>
        <input
          type="url"
          id="webhook-url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          required
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none focus:ring-indigo-500 dark:focus:ring-indigo-400 placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Create a webhook in your Discord server settings
        </p>
      </div>

      <div>
        <label htmlFor="webhook-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Name (optional)
        </label>
        <input
          type="text"
          id="webhook-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Team Calendar"
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none focus:ring-indigo-500 dark:focus:ring-indigo-400 placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
          <p className="text-sm text-green-800 dark:text-green-200">Discord webhook added successfully!</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-indigo-600 dark:bg-indigo-500 px-4 py-2 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50"
      >
        {loading ? 'Adding...' : 'Add Discord Webhook'}
      </button>
    </form>
  );
}
