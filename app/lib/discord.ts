export interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
  footer?: {
    text: string;
  };
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export async function postToDiscord(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const response = await fetch(webhookUrl + '?wait=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 404 || response.status === 401) {
      return {
        success: false,
        error: `Discord webhook returned ${response.status}. Webhook may be invalid or deleted.`,
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Discord webhook failed: ${response.status} ${errorText}`,
      };
    }

    // Parse response to get message ID
    try {
      const data = await response.json();
      return { success: true, messageId: data.id };
    } catch {
      return { success: true };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function postToDiscordWithRetry(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await postToDiscord(webhookUrl, payload);

    if (result.success) {
      return result;
    }

    lastError = result.error;

    // Only retry on 5xx errors
    if (result.error?.includes('5')) {
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      continue;
    }

    // Don't retry on 4xx errors (invalid webhook, etc.)
    break;
  }

  return {
    success: false,
    error: lastError,
  };
}

/**
 * Edit an existing Discord message via webhook
 */
export async function editDiscordMessage(
  webhookUrl: string,
  messageId: string,
  payload: DiscordWebhookPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    // Discord webhook edit URL format: {webhookUrl}/messages/{messageId}
    // Extract base URL and query params separately
    const urlParts = webhookUrl.split('?');
    const baseUrl = urlParts[0];
    const queryParams = urlParts[1] || '';
    const editUrl = `${baseUrl}/messages/${messageId}${queryParams ? '?' + queryParams : ''}`;

    const response = await fetch(editUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 404) {
      return {
        success: false,
        error: 'Message not found - may have been deleted',
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to edit message: ${response.status} ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
