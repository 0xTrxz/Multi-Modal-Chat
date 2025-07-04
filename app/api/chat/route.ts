import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

// Define types for better type safety
type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: string;
};

type AttachmentType = {
  name: string;
  contentType: string;
  url: string;
};

export async function POST(req: Request) {
  try {
    // Safely parse request body with error handling
    const body = await req.json().catch(error => {
      console.error('Failed to parse request JSON:', error);
      return {};
    });
    
    // Destructure with validation
    const { messages, chatId, experimental_attachments, activeMode, activeTool } = body;
    
    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid messages field' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract the single latest message
    const latestMessage = messages[0];
    
    // Construct the prefixed message
    const prefixes = [];
    if (activeMode) {
      prefixes.push(`/${activeMode}`);
    }
    if (activeTool) {
      const toolCommand = activeTool === 'voice' ? 'audio' : activeTool;
      prefixes.push(`/${toolCommand}`);
    }

    const prefixString = prefixes.join(' ');
    const originalContent = messages[0].content;
    const prefixedContent = prefixString ? `${prefixString} ${originalContent}` : originalContent;

    // If this is a video request, we will not wait for the webhook.
    // We expect n8n to return a jobId immediately.
    if (activeTool === 'video') {
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!webhookUrl) {
        return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 500 });
      }

      try {
        const n8nResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: { ...messages[0], content: prefixedContent },
            chatId,
            experimental_attachments,
          }),
        });

        const data = await n8nResponse.json();
        
        // We expect n8n to immediately return the Replicate stream URL
        // Safely extract the URL string, even if it's nested
        let streamUrl = null;
        if (typeof data.replicateStreamUrl === 'string') {
          streamUrl = data.replicateStreamUrl;
        } else if (Array.isArray(data.replicateStreamUrl) && data.replicateStreamUrl.length > 0 && data.replicateStreamUrl[0].url) {
          streamUrl = data.replicateStreamUrl[0].url;
        }

        const initialContent = data.content || "Give me one second, Daddy...";

        if (streamUrl) {
          return new Response(JSON.stringify({
            status: 'pending',
            replicateStreamUrl: streamUrl,
            content: initialContent,
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          console.error("n8n response did not contain a valid replicateStreamUrl:", data);
          throw new Error("Could not find a valid Replicate stream URL in the n8n response.");
        }

      } catch (error) {
        console.error('Error calling n8n for video job:', error);
        return new Response(JSON.stringify({ error: 'Failed to start video generation.' }), { status: 500 });
      }
    }

    const messageToSend = {
      ...messages[0],
      content: prefixedContent,
    };

    // Check if n8n webhook integration is enabled
    if (process.env.USE_N8N_WEBHOOK === 'true') {
      // Validate webhook URL
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      
      // --> Add this line for debugging <--
      console.log(`[DEBUG] Attempting to call n8n webhook at: ${webhookUrl}`);

      if (!webhookUrl) {
        console.error('N8N webhook URL not configured');
        // Fallback to direct OpenAI if webhook URL is missing
        return fallbackToDirectOpenAI(messages);
      }
      
      try {
        // Call n8n webhook with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10-minute timeout
        
        // Only send the latest message and the chatId to n8n
        const n8nResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: messageToSend, 
            chatId, 
            experimental_attachments 
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Check if response is OK
        if (!n8nResponse.ok) {
          console.error(`N8N webhook error: ${n8nResponse.status} ${n8nResponse.statusText}`);
          return fallbackToDirectOpenAI(messages);
        }
        
        // Handle n8n response based on content type
        const contentType = n8nResponse.headers.get('Content-Type') || '';
        
        if (contentType.includes('application/json')) {
          // Parse JSON response
          const result = await n8nResponse.json();
          
          // If n8n returns a messages array for streaming
          if (result.messages && Array.isArray(result.messages)) {
            // Stream the n8n messages back using openai model as a proxy
            const streamResult = streamText({
              model: openai("gpt-4o"),
              messages: result.messages,
            });
            return streamResult.toDataStreamResponse();
          } else {
            // Return direct JSON response
            return new Response(JSON.stringify(result), { 
              status: 200, 
              headers: { 'Content-Type': 'application/json' } 
            });
          }
        } else if (contentType.includes('text/event-stream')) {
          // Pass through streaming response
          return new Response(n8nResponse.body, { 
            status: 200, 
            headers: { 'Content-Type': 'text/event-stream' } 
          });
        } else if (contentType.includes('audio/') || 
                   contentType.includes('video/') || 
                   contentType.includes('image/') ||
                   contentType.includes('application/octet-stream')) {
          // Handle binary data (audio, video, images) by preserving content type and body
          return new Response(n8nResponse.body, { 
            status: 200, 
            headers: { 'Content-Type': contentType } 
          });
        } else {
          // For other content types, just pass through
          return new Response(n8nResponse.body, { 
            status: 200, 
            headers: { 'Content-Type': contentType } 
          });
        }
      } catch (error) {
        console.error('Error calling n8n webhook:', error);
        return fallbackToDirectOpenAI(messages);
      }
    } else {
      // Use direct OpenAI integration (current implementation)
      return fallbackToDirectOpenAI(messages);
    }
  } catch (error) {
    console.error('Error processing chat request:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Helper function for fallback to direct OpenAI (current implementation)
function fallbackToDirectOpenAI(messages: ChatMessage[]) {
  const result = streamText({
    model: openai("gpt-4o"),
    system:
      "do not respond on markdown or lists, keep your responses brief, you can ask the user to upload images or documents if it could help you understand the problem better",
    messages,
  });
  return result.toDataStreamResponse();
}
