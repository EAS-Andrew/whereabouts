import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createDiscordChannel, listUserDiscordChannels } from '@/app/lib/redis';
import { getUser } from '@/app/lib/redis';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const channels = await listUserDiscordChannels(user.id);

    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Error listing Discord channels:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list Discord channels' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUser(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { webhook_url, name, is_default } = body;

    if (!webhook_url || typeof webhook_url !== 'string') {
      return NextResponse.json({ error: 'webhook_url is required' }, { status: 400 });
    }

    // Validate Discord webhook URL format
    if (!webhook_url.startsWith('https://discord.com/api/webhooks/')) {
      return NextResponse.json({ error: 'Invalid Discord webhook URL format' }, { status: 400 });
    }

    const channel = await createDiscordChannel({
      user_id: user.id,
      webhook_url,
      name: name || undefined,
      is_default: is_default || false,
    });

    return NextResponse.json({ channel });
  } catch (error) {
    console.error('Error creating Discord channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Discord channel' },
      { status: 500 }
    );
  }
}
