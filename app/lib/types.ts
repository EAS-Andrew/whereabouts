export interface User {
  id: string;
  google_user_id: string;
  email: string;
  access_token: string; // encrypted
  refresh_token: string; // encrypted
  access_token_expires_at: number;
  created_at: string;
  updated_at: string;
}

export interface DiscordChannel {
  id: string;
  user_id: string;
  name?: string;
  webhook_url: string; // encrypted
  is_default?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarSubscription {
  id: string;
  user_id: string;
  calendar_id: string;
  calendar_summary: string;
  discord_channel_id: string;
  google_channel_id?: string;
  google_resource_id?: string;
  google_channel_expiration?: number;
  sync_token?: string;
  active: boolean;
  notify_new_events: boolean;
  notify_updates: boolean;
  notify_cancellations: boolean;
  notify_window_minutes: number;
  created_at: string;
  updated_at: string;
  last_sync_at?: string;
}

export interface CachedEvent {
  event_id: string;
  etag: string;
  start_time: string;
  end_time: string;
  summary?: string;
  location?: string;
  status: string;
  last_seen_at: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
  status: string;
  etag: string;
  updated: string;
}

export interface EventChange {
  type: 'new' | 'updated' | 'cancelled';
  event: GoogleCalendarEvent;
  previousEvent?: CachedEvent;
  changes?: string[];
}
