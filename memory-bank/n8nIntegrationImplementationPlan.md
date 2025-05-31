# n8n Webhook Integration Implementation Plan

## 1. Deep Analysis: Current vs. n8n Template

### Current Implementation (`app/api/chat/route.ts`)

- Uses Vercel AI SDK (`streamText`) with OpenAI model directly.
- No n8n webhook call; all AI logic is handled in-app.
- Only `messages` are accepted in the POST body (no file/attachment support).
- No explicit chatId or advanced payload structure.
- No persistence or external workflow integration.
- Uses streaming response to support real-time message display.

### n8n Template (from `chatFlowWithN8N.md`)

- POST body includes `messages`, `chatId`, and optionally `experimental_attachments`.
- Calls an n8n webhook endpoint, forwarding the chat payload.
- n8n processes the message (enrich, moderate, call AI, etc.) and returns a result.
- Optionally, the result is processed or persisted before returning to the frontend.
- Supports streaming or direct response.

### Key Differences

- **External Workflow:** n8n webhook call vs. direct OpenAI call.
- **Payload Structure:** n8n expects richer payload (attachments, chatId, etc.).
- **File/Attachment Support:** n8n flow supports multi-modal (images, text, other files).
- **Extensibility:** n8n enables custom workflow, moderation, enrichment, etc.
- **Response Handling:** Need to maintain streaming capability for real-time UX.

---

## 2. Implementation Plan (Phased, Safe, and Modular)

### **Phase 1: Refactor API Route for Extensibility**

- Refactor `app/api/chat/route.ts` to accept `chatId` and `experimental_attachments` in the POST body.
- Add type validation and error handling for new fields.
- Ensure backward compatibility: if only `messages` are sent, default to current behavior.

**Example with Improved Type Safety and Error Handling:**

```ts
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
    const { messages, chatId, experimental_attachments } = body;
    
    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid messages field' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Process with existing logic (for backward compatibility)
    const result = streamText({
      model: openai("gpt-4o"),
      system:
        "do not respond on markdown or lists, keep your responses brief, you can ask the user to upload images or documents if it could help you understand the problem better",
      messages,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Error processing chat request:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### **Phase 2: Add n8n Webhook Support (Feature Flag)**

- Add a feature flag (e.g., env var `USE_N8N_WEBHOOK`) to toggle between direct OpenAI and n8n webhook.
- If enabled, forward the payload to the n8n webhook and return its response.
- If disabled, use the current OpenAI logic.
- Log and handle errors gracefully.
- Ensure proper timeout and stream handling.

**Example with Robust Error Handling and Streaming Support:**

```ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(error => {
      console.error('Failed to parse request JSON:', error);
      return {};
    });
    
    const { messages, chatId, experimental_attachments } = body;
    
    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid messages field' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if n8n webhook integration is enabled
    if (process.env.USE_N8N_WEBHOOK === 'true') {
      // Validate webhook URL
      const webhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!webhookUrl) {
        console.error('N8N webhook URL not configured');
        // Fallback to direct OpenAI if webhook URL is missing
        return fallbackToDirectOpenAI(messages);
      }
      
      try {
        // Call n8n webhook with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
        
        const n8nResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, chatId, experimental_attachments }),
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
            // Stream response using Vercel AI SDK
            const streamResult = streamText({
              model: {
                async call() { return { messages: result.messages }; },
              },
              messages,
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
function fallbackToDirectOpenAI(messages) {
  const result = streamText({
    model: openai("gpt-4o"),
    system:
      "do not respond on markdown or lists, keep your responses brief, you can ask the user to upload images or documents if it could help you understand the problem better",
    messages,
  });
  return result.toDataStreamResponse();
}
```

### **Phase 3: Add File/Attachment Support (UI & API)**

- Update frontend to allow all file types (see `uiMigrationAndBestPractices.md`).
- Validate and preview files before upload.
- Pass files as Data URLs or base64 in `experimental_attachments`.
- Update backend to forward attachments to n8n.
- Ensure robust error handling and user feedback.

**Example (UI) with Improved File Handling:**

```tsx
'use client';
import { useChat } from '@ai-sdk/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

// File type validation
const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',  // Images
  'text/plain', 'text/csv', 'application/pdf',           // Documents
  'application/json', 'text/html'                       // Data
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/chat',
    // Preserve existing chat parameters
    body: { chatId: /* existing chat ID logic */ },
    initialMessages: /* existing messages logic */,
    onFinish: /* existing onFinish logic */,
    onError: (error) => {
      console.error('Chat error:', error);
      toast.error('Error: ' + (error.message || 'Failed to send message'));
    },
  });
  
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection with validation
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) {
      setFiles(undefined);
      setFileErrors([]);
      return;
    }

    // Validate files
    const errors: string[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Check file type
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        errors.push(`${file.name}: File type not supported`);
      }
      
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
      }
    }
    
    if (errors.length > 0) {
      setFileErrors(errors);
      // Show first error as toast
      toast.error(errors[0]);
    } else {
      setFileErrors([]);
      setFiles(selectedFiles);
      toast.success(`${selectedFiles.length} file(s) ready to send`);
    }
  };

  // Handle form submission
  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    
    // Validate input
    if (!input.trim() && (!files || files.length === 0)) {
      toast.error('Please enter a message or attach a file');
      return;
    }
    
    // Check for file errors
    if (fileErrors.length > 0) {
      toast.error('Please fix file errors before sending');
      return;
    }
    
    // Submit form
    handleSubmit(event, { experimental_attachments: files });
    
    // Reset file input
    setFiles(undefined);
    setFileErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div>
      {/* Messages display - preserve existing UI */}
      <div>
        {messages.map(message => (
          <div key={message.id}>
            {/* Preserve existing message UI */}
            <div>{message.content}</div>
            
            {/* Render attachments if present */}
            {message.experimental_attachments?.length > 0 && (
              <div className="message-attachments">
                {message.experimental_attachments.map((attachment, idx) => (
                  <div key={idx} className="attachment">
                    {attachment.contentType?.startsWith('image/') ? (
                      <img 
                        src={attachment.url} 
                        alt={attachment.name} 
                        className="max-w-full max-h-60 rounded-md"
                      />
                    ) : (
                      <a 
                        href={attachment.url} 
                        download={attachment.name}
                        className="flex items-center"
                      >
                        {/* File icon */}
                        <span className="file-icon mr-2">📄</span>
                        {attachment.name}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* File errors display */}
      {fileErrors.length > 0 && (
        <div className="file-errors text-red-500 mb-2">
          {fileErrors.map((error, idx) => (
            <div key={idx}>{error}</div>
          ))}
        </div>
      )}
      
      {/* Input form - preserve existing UI structure */}
      <form onSubmit={handleFormSubmit}>
        {/* File input */}
        <div className="file-input-container">
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            ref={fileInputRef}
            aria-label="Attach files"
            className="file-input"
            accept={ALLOWED_FILE_TYPES.join(',')}
          />
          {files && files.length > 0 && (
            <div className="file-preview">
              {Array.from(files).map((file, idx) => (
                <div key={idx} className="file-item">
                  {file.name}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Message input - preserve existing UI */}
        <input
          value={input}
          placeholder="Send message..."
          onChange={handleInputChange}
          disabled={status !== 'ready'}
          aria-label="Message input"
        />
        
        {/* Submit button - preserve existing UI */}
        <button 
          type="submit" 
          disabled={status !== 'ready'}
          aria-label="Send message"
        >
          {status === 'ready' ? 'Send' : 'Sending...'}
        </button>
      </form>
    </div>
  );
}
```

### **Phase 4: Advanced UI/UX Enhancements**

- Add toasts, loading indicators, and accessibility improvements.
- Support drag-and-drop, paste, and upload button for files.
- Ensure dark/light theme support and keyboard accessibility.
- Keep all new UI-only features isolated from backend logic unless explicitly required.

---

## 3. Precautions & Best Practices

- **Backward Compatibility:** Always default to current behavior if new fields/flags are missing.
- **Feature Flags:** Use env vars to toggle new features for safe rollout.
- **Type Safety:** Validate all incoming payloads and file types.
- **Error Handling:** Log and surface errors clearly in both UI and API.
- **Testing:** Test each phase locally before merging or pushing.
- **Documentation:** Update memory bank docs after each major change.
- **No UI/UX Regression:** Do not alter existing UI components or flows unless explicitly required.
- **CORS Handling**: Ensure proper CORS configuration for n8n webhook.
- **Timeout Management**: Implement timeouts for external API calls to avoid hanging requests.
- **Streaming Support**: Maintain streaming capability for real-time user experience.
- **File Size Limits**: Enforce reasonable file size limits to prevent payload issues.
- **Security**: Validate file types and sanitize content to prevent security vulnerabilities.
- **Fallback Mechanisms**: Implement graceful fallbacks when n8n is unavailable.

## 4. Common Risks and Mitigations

### API Integration Risks
- **Risk**: N8n webhook timeouts or failures
  - **Mitigation**: Add timeout handling, fallback to direct OpenAI, and alert users
- **Risk**: Streaming response incompatibility
  - **Mitigation**: Support both streaming and non-streaming response patterns

### File Handling Risks
- **Risk**: Excessive file sizes causing API failures
  - **Mitigation**: Implement client-side file size checks and server-side limits
- **Risk**: Unsupported file types
  - **Mitigation**: Validate file types on client and server side
- **Risk**: Base64 encoding overhead for large files
  - **Mitigation**: Implement progressive loading or chunking for large files

### UI/UX Risks
- **Risk**: Breaking existing UI components
  - **Mitigation**: Preserve all existing UI/UX patterns, only extend functionality
- **Risk**: Poor user feedback during async operations
  - **Mitigation**: Add loading states, toasts, and clear error messaging

## 5. Implementation Checklist

- [ ] Update .env.example with n8n webhook configuration
- [ ] Refactor API route to accept extended payload
- [ ] Add feature flags for n8n integration
- [ ] Implement robust error handling and fallbacks
- [ ] Update frontend for file type support
- [ ] Add UI validation and feedback
- [ ] Test all phases with and without n8n
- [ ] Update documentation

## 6. Rollback & Recovery

- If any phase causes issues, revert to previous phase using feature flags.
- Keep all new logic modular and well-commented for easy debugging.
- Use Git branches to isolate changes for each phase.

## 7. Next Steps

- Review this plan and approve or request changes.
- Once approved, implement each phase sequentially, testing and documenting as you go.
- Create a test n8n webhook to validate integration before full deployment.