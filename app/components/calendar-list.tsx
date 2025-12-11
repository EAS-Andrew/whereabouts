'use client';

import { useState, useEffect } from 'react';

interface Calendar {
  id: string;
  summary: string;
  summaryOverride?: string;
  accessRole?: string;
}

interface DiscordChannel {
  id: string;
  name?: string;
  webhook_url: string;
}

export function CalendarList() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [discordChannels, setDiscordChannels] = useState<DiscordChannel[]>([]);
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(new Set());
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [notifyNewEvents, setNotifyNewEvents] = useState(true);
  const [notifyUpdates, setNotifyUpdates] = useState(true);
  const [notifyCancellations, setNotifyCancellations] = useState(true);
  const [notifyWindowMinutes, setNotifyWindowMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [calendarsRes, channelsRes] = await Promise.all([
        fetch('/api/calendars/list'),
        fetch('/api/discord-channels'),
      ]);

      if (!calendarsRes.ok || !channelsRes.ok) {
        throw new Error('Failed to load data');
      }

      const calendarsData = await calendarsRes.json();
      const channelsData = await channelsRes.json();

      setCalendars(calendarsData.calendars || []);
      setDiscordChannels(channelsData.channels || []);

      if (channelsData.channels?.length > 0) {
        setSelectedChannel(channelsData.channels[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendars');
    } finally {
      setLoading(false);
    }
  }

  const handleCalendarToggle = (calendarId: string) => {
    const newSelected = new Set(selectedCalendars);
    if (newSelected.has(calendarId)) {
      newSelected.delete(calendarId);
    } else {
      newSelected.add(calendarId);
    }
    setSelectedCalendars(newSelected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedCalendars.size === 0) {
      setError('Please select at least one calendar');
      return;
    }

    if (!selectedChannel) {
      setError('Please select a Discord webhook');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const subscriptions = Array.from(selectedCalendars).map((calendarId) => {
        const calendar = calendars.find((c) => c.id === calendarId);
        return fetch('/api/calendars/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            calendar_id: calendarId,
            calendar_summary: calendar?.summary || calendarId,
            discord_channel_id: selectedChannel,
            notify_new_events: notifyNewEvents,
            notify_updates: notifyUpdates,
            notify_cancellations: notifyCancellations,
            notify_window_minutes: notifyWindowMinutes,
          }),
        });
      });

      const results = await Promise.all(subscriptions);
      const errors = results.filter((r) => !r.ok);

      if (errors.length > 0) {
        throw new Error('Some subscriptions failed to create');
      }

      setSuccess(true);
      setSelectedCalendars(new Set());

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subscriptions');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-gray-600">Loading calendars...</div>;
  }

  if (discordChannels.length === 0) {
    return (
      <div className="rounded-md bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800">
          Please add a Discord webhook above before subscribing to calendars.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Discord Webhook
        </label>
        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
        >
          {discordChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name || channel.id}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Calendars
        </label>
        <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md p-4">
          {calendars.map((calendar) => (
            <label
              key={calendar.id}
              className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
            >
              <input
                type="checkbox"
                checked={selectedCalendars.has(calendar.id)}
                onChange={() => handleCalendarToggle(calendar.id)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">
                {calendar.summaryOverride || calendar.summary || calendar.id}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <h3 className="text-sm font-medium text-gray-700">Notification Settings</h3>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={notifyNewEvents}
            onChange={(e) => setNotifyNewEvents(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">Notify on new events</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={notifyUpdates}
            onChange={(e) => setNotifyUpdates(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">Notify on event updates</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={notifyCancellations}
            onChange={(e) => setNotifyCancellations(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">Notify on event cancellations</span>
        </label>

        <div>
          <label htmlFor="window-minutes" className="block text-sm font-medium text-gray-700">
            Notify only for events within (minutes, 0 = all events)
          </label>
          <input
            type="number"
            id="window-minutes"
            min="0"
            value={notifyWindowMinutes}
            onChange={(e) => setNotifyWindowMinutes(parseInt(e.target.value) || 0)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-800">Subscriptions created successfully!</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || selectedCalendars.size === 0}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {submitting ? 'Creating subscriptions...' : 'Subscribe to Selected Calendars'}
      </button>
    </form>
  );
}
