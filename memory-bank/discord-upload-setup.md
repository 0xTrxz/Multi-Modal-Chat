# Discord File Upload Setup

This document explains how to set up Discord as a file storage solution for our Multi-Modal Chat app.

## Why Discord?

Discord provides free file hosting via webhooks, which makes it an excellent solution for:

- Storing chat file attachments without size encoding overhead
- Reducing API payload sizes (URLs instead of base64 content)
- Getting reliable CDN delivery of files
- No additional infrastructure needed

## Setup Instructions

1. **Create a Discord server** (skip if you already have one)
   - Open Discord and click the "+" button on the left sidebar
   - Choose "Create My Own" and follow the prompts

2. **Create a webhook**
   - Right-click on a channel and select "Edit Channel"
   - Go to "Integrations" > "Webhooks"
   - Click "New Webhook"
   - Customize the name (e.g., "File Uploader")
   - Click "Copy Webhook URL"

3. **Add to environment variables**
   - Create or edit `.env.local` in your project root
   - Add the following line with your webhook URL:

   ``
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-id/your-webhook-token
   ``

   - Restart your development server

## How It Works

1. When a user attaches a file to a message:
   - The file is sent to our Discord upload API endpoint
   - The endpoint forwards the file to Discord via webhook
   - Discord stores the file and returns a CDN URL
   - The CDN URL is stored with the message instead of the base64 data

2. When viewing messages with attachments:
   - Images are displayed directly from Discord's CDN
   - Documents are provided as links to their Discord URL
   - All attachments maintain their file information (name, type)

## Security Considerations

- Keep your webhook URL private as it allows anyone to upload to your Discord channel
- Discord webhooks are one-way (upload only), so there's minimal security risk
- Consider creating a private channel specifically for file uploads
- You can regenerate the webhook if it ever gets exposed

## Limitations

- Discord may have rate limits for webhooks (typically 30 messages per minute)
- Files remain available as long as the Discord channel/server exists
- Maximum file size is limited to Discord's file size limits (usually 8-25MB depending on server boost level)
