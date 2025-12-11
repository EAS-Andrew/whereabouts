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
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
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

    return { success: true };
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
): Promise<{ success: boolean; error?: string }> {
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
