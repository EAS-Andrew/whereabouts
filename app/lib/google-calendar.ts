import { google } from 'googleapis';
import { getUser, updateUser } from './redis';
import type { GoogleCalendarEvent } from './types';

export async function getGoogleCalendarClient(googleUserId: string) {
  console.log(`[getGoogleCalendarClient] Getting client for user: ${googleUserId}`);

  const user = await getUser(googleUserId);
  if (!user) {
    console.error(`[getGoogleCalendarClient] User not found: ${googleUserId}`);
    throw new Error('User not found');
  }
  console.log(`[getGoogleCalendarClient] User found: ${user.email}`);

  // Check if token needs refresh (refresh 5 minutes before expiry to be safe)
  let accessToken = user.access_token;
  const now = Date.now();
  const refreshBuffer = 5 * 60 * 1000; // 5 minutes
  const expiresIn = user.access_token_expires_at - now;

  console.log(`[getGoogleCalendarClient] Token expires in ${Math.round(expiresIn / 1000)}s`);

  if (user.access_token_expires_at < now + refreshBuffer) {
    console.log(`[getGoogleCalendarClient] Token expired/expiring soon, refreshing...`);
    // Token expired or about to expire, refresh it
    try {
      const refreshed = await refreshAccessToken(user.refresh_token);
      accessToken = refreshed.access_token;

      await updateUser(googleUserId, {
        access_token: refreshed.access_token,
        access_token_expires_at: Date.now() + refreshed.expires_in * 1000,
      });
      console.log(`[getGoogleCalendarClient] ✅ Token refreshed successfully`);
    } catch (error) {
      console.error(`[getGoogleCalendarClient] ❌ Failed to refresh access token for user ${googleUserId}:`, error);
      throw new Error('Failed to refresh access token. User may need to re-authenticate.');
    }
  } else {
    console.log(`[getGoogleCalendarClient] Token still valid, using existing token`);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: user.refresh_token,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(
    'https://oauth2.googleapis.com/token?' +
    new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to refresh token: ${JSON.stringify(error)}`);
  }

  return await response.json();
}

export async function listCalendars(googleUserId: string) {
  const calendar = await getGoogleCalendarClient(googleUserId);
  const response = await calendar.calendarList.list();
  return response.data.items || [];
}

export async function listEvents(
  googleUserId: string,
  calendarId: string,
  options?: {
    timeMin?: string;
    timeMax?: string;
    syncToken?: string;
    maxResults?: number;
    singleEvents?: boolean;
    orderBy?: 'startTime' | 'updated';
    pageToken?: string;
  }
) {
  console.log(`[listEvents] Fetching events for user ${googleUserId}, calendar ${calendarId}`);
  console.log(`[listEvents] Options:`, options);

  try {
    console.log(`[listEvents] Getting Google Calendar client...`);
    const calendar = await getGoogleCalendarClient(googleUserId);
    console.log(`[listEvents] ✅ Got calendar client`);

    const params: any = {
      calendarId,
      ...options,
    };

    if (options?.singleEvents !== undefined) {
      params.singleEvents = options.singleEvents;
    }
    if (options?.orderBy) {
      params.orderBy = options.orderBy;
    }

    console.log(`[listEvents] Calling Google Calendar API with params:`, JSON.stringify(params, null, 2));
    const startTime = Date.now();
    
    const response = await Promise.race([
      calendar.events.list(params),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Google Calendar API call timed out after 30 seconds')), 30000)
      )
    ]) as Awaited<ReturnType<typeof calendar.events.list>>;
    
    const duration = Date.now() - startTime;
    console.log(`[listEvents] ✅ API call succeeded in ${duration}ms, got ${response.data.items?.length || 0} events`);

    return {
      items: (response.data.items || []) as GoogleCalendarEvent[],
      nextPageToken: response.data.nextPageToken,
      nextSyncToken: response.data.nextSyncToken,
    };
  } catch (error) {
    console.error(`[listEvents] ❌ Error fetching events:`, error);
    if (error instanceof Error) {
      console.error(`[listEvents] Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
    throw error;
  }
}

export async function watchCalendar(
  googleUserId: string,
  calendarId: string,
  channelId: string,
  webhookUrl: string
) {
  const calendar = await getGoogleCalendarClient(googleUserId);

  const response = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
    },
  });

  return {
    resourceId: response.data.resourceId,
    expiration: response.data.expiration ? parseInt(response.data.expiration) : undefined,
  };
}

export async function stopWatchChannel(
  googleUserId: string,
  resourceId: string,
  channelId: string
) {
  const calendar = await getGoogleCalendarClient(googleUserId);

  await calendar.channels.stop({
    requestBody: {
      id: channelId,
      resourceId,
    },
  });
}
