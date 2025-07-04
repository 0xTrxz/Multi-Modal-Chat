import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // Get Discord webhook URL from environment variables
    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!discordWebhookUrl) {
      return NextResponse.json(
        { error: 'Discord webhook URL not configured' },
        { status: 500 }
      );
    }
    
    // Parse the multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Create a new FormData object for the Discord API
    const discordFormData = new FormData();
    discordFormData.append('file', file);
    
    // Add optional message content
    const payload = {
      content: "File uploaded from chat",
      username: "File Uploader"
    };
    discordFormData.append('payload_json', JSON.stringify(payload));
    
    // Send the file to Discord
    const response = await fetch(discordWebhookUrl, {
      method: 'POST',
      body: discordFormData,
    });
    
    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
    }
    
    // Get the Discord CDN URL from the response
    const data = await response.json();
    let fileUrl = '';
    
    // Extract attachment URL from Discord response
    if (data && data.attachments && data.attachments.length > 0) {
      fileUrl = data.attachments[0].url;
    }
    
    return NextResponse.json({ url: fileUrl });
  } catch (error) {
    console.error('Error uploading to Discord:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
} 