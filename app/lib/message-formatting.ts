import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns';
import type { GoogleCalendarEvent, EventChange } from './types';
import type { DiscordWebhookPayload, DiscordEmbed } from './discord';

export function formatEventChangeForDiscord(
  change: EventChange,
  calendarSummary: string
): DiscordWebhookPayload {
  const { event, type, previousEvent, changes } = change;

  const emojiMap: Record<string, string> = {
    new: '✨',
    updated: '✏️',
    cancelled: '❌',
  };

  const statusMap: Record<string, string> = {
    new: 'New Event',
    updated: 'Event Updated',
    cancelled: 'Event Cancelled',
  };

  const emoji = emojiMap[type] || '📅';
  const status = statusMap[type] || 'Event Change';

  const embed: DiscordEmbed = {
    title: `${emoji} ${status} in ${calendarSummary}`,
    color: type === 'cancelled' ? 15158332 : type === 'new' ? 3066993 : 3447003,
    fields: [],
    timestamp: new Date().toISOString(),
  };

  if (event.summary) {
    embed.description = event.summary;
  }

  // Time field
  if (event.start) {
    const startTime = event.start.dateTime
      ? parseISO(event.start.dateTime)
      : event.start.date
        ? parseISO(event.start.date + 'T00:00:00')
        : null;

    if (startTime) {
      const isAllDay = !!event.start.date;
      const timeDisplay = isAllDay
        ? format(startTime, 'EEEE, MMMM d, yyyy')
        : `${format(startTime, 'EEEE, MMMM d, yyyy')} at ${format(startTime, 'h:mm a')}`;

      let timeValue = timeDisplay;

      if (!isAllDay && !isPast(startTime)) {
        const relativeTime = formatDistanceToNow(startTime, { addSuffix: true });
        timeValue += ` (${relativeTime})`;
      }

      if (event.end) {
        const endTime = event.end.dateTime
          ? parseISO(event.end.dateTime)
          : event.end.date
            ? parseISO(event.end.date + 'T23:59:59')
            : null;

        if (endTime && !isAllDay) {
          timeValue += ` - ${format(endTime, 'h:mm a')}`;
        } else if (endTime && isAllDay) {
          if (format(startTime, 'yyyy-MM-dd') !== format(endTime, 'yyyy-MM-dd')) {
            timeValue += ` to ${format(endTime, 'EEEE, MMMM d, yyyy')}`;
          }
        }
      }

      embed.fields!.push({
        name: 'When',
        value: timeValue,
        inline: false,
      });
    }
  }

  // Location field
  if (event.location) {
    embed.fields!.push({
      name: 'Where',
      value: event.location,
      inline: false,
    });
  }

  // Changes field (for updates)
  if (type === 'updated' && changes && changes.length > 0) {
    embed.fields!.push({
      name: 'Changes',
      value: changes.join(', '),
      inline: false,
    });
  }

  // Status field
  embed.fields!.push({
    name: 'Status',
    value: status,
    inline: true,
  });

  return {
    embeds: [embed],
  };
}

export function formatEventTimeRange(event: GoogleCalendarEvent): string {
  if (!event.start) return 'No time specified';

  const startTime = event.start.dateTime
    ? parseISO(event.start.dateTime)
    : event.start.date
      ? parseISO(event.start.date + 'T00:00:00')
      : null;

  if (!startTime) return 'Invalid time';

  const isAllDay = !!event.start.date;

  if (isAllDay) {
    if (event.end && event.end.date) {
      const endTime = parseISO(event.end.date + 'T23:59:59');
      if (format(startTime, 'yyyy-MM-dd') !== format(endTime, 'yyyy-MM-dd')) {
        return `${format(startTime, 'MMMM d')} - ${format(endTime, 'MMMM d, yyyy')}`;
      }
    }
    return format(startTime, 'EEEE, MMMM d, yyyy');
  }

  const startStr = `${format(startTime, 'MMM d, h:mm a')}`;

  if (event.end && event.end.dateTime) {
    const endTime = parseISO(event.end.dateTime);
    return `${startStr} - ${format(endTime, 'h:mm a')}`;
  }

  return startStr;
}
