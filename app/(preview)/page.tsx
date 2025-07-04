/* eslint-disable @next/next/no-img-element */
"use client";

import {
  AttachmentIcon,
  BotIcon,
  UserIcon,
  VercelIcon,
} from "@/components/icons";
import { DragEvent, useEffect, useRef, useState } from "react";
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { v4 as uuidv4 } from 'uuid';

// File type validation - expanded to support more file types
const ALLOWED_FILE_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'text/plain', 'text/csv', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Data
  'application/json', 'text/html', 'application/xml',
  // Other common types
  'application/zip', 'application/x-zip-compressed',
  'audio/mpeg', 'audio/wav', 'video/mp4'
];

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Message type definition
type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'pending' | 'completed' | 'failed';
  replicateStreamUrl?: string;
  experimental_attachments?: Array<{
    name: string;
    contentType: string;
    url: string;
  }>;
};

// For fetching text content from URLs
const getTextFromUrl = async (url: string): Promise<string> => {
  try {
    // Check if it's a data URL
    if (url.startsWith('data:')) {
      const base64 = url.split(",")[1];
      return window.atob(base64);
    }
    
    // Otherwise, fetch the content
    const response = await fetch(url);
    return await response.text();
  } catch (error) {
    console.error('Error fetching text content:', error);
    return 'Error loading text content';
  }
};

// Get file icon based on MIME type
const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('text/')) return '📄';
  if (mimeType.startsWith('audio/')) return '🔊';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.includes('pdf')) return '📑';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('sheet')) return '📊';
  if (mimeType.includes('zip')) return '🗜️';
  if (mimeType.includes('json')) return '🔤';
  return '📎'; // Default file icon
};

function TextFilePreview({ file }: { file: File }) {
  const [content, setContent] = useState<string>("");

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      setContent(typeof text === "string" ? text.slice(0, 100) : "");
    };
    reader.readAsText(file);
  }, [file]);

  return (
    <div>
      {content}
      {content.length >= 100 && "..."}
    </div>
  );
}

// Generic file preview component
function FilePreview({ file }: { file: File }) {
  const fileIcon = getFileIcon(file.type);
  
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="text-2xl">{fileIcon}</div>
      <div className="text-[8px] truncate max-w-full">{file.name}</div>
    </div>
  );
}

// Function to handle file uploads through Discord
const processFilesToAttachments = async (files: FileList | null) => {
  if (!files || files.length === 0) return [];
  
  const attachments = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      // Create FormData for each file
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload to Discord via our API endpoint
      const response = await fetch('/api/discord-upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.url) {
        throw new Error('No URL returned from upload');
      }
      
      // Add the Discord CDN URL to attachments
      attachments.push({
        name: file.name,
        contentType: file.type,
        url: data.url // Discord CDN URL
      });
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error(`Failed to upload ${file.name}`);
      // Continue with other files even if one fails
    }
  }
  
  return attachments;
};

// Custom iMessage-style Audio Player
function CustomAudioPlayer({
  src,
  isUserMessage,
}: {
  src: string;
  isUserMessage: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  // Toggles play/pause state
  const togglePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Format time from seconds to MM:SS
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle time and duration updates
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
    };

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime);
      }
    };

    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    // Cleanup
    return () => {
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [isSeeking]);

  // Handle seeking with mouse/touch
  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current || duration === 0) return;

    const progressBar = progressRef.current;
    const rect = progressBar.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const percent = Math.min(Math.max(0, (clientX - rect.left) / rect.width), 1);
    const seekTime = percent * duration;
    
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  // Add mouse move/up listeners for seeking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleSeek(e as any);
    const handleTouchMove = (e: TouchEvent) => handleSeek(e as any);
    const handleMouseUp = () => setIsSeeking(false);

    if (isSeeking) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isSeeking, duration]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Define theme-based colors
  const themeClasses = isUserMessage
    ? {
        text: 'text-white',
        progressBg: 'bg-white/20',
        progressFill: 'bg-white',
        buttonBg: 'bg-blue-600',
      }
    : {
        text: 'text-zinc-600 dark:text-zinc-300',
        progressBg: 'bg-zinc-300 dark:bg-zinc-700',
        progressFill: 'bg-zinc-500 dark:bg-zinc-400',
        buttonBg: 'bg-zinc-300 dark:bg-zinc-700',
      };

  return (
    <div className={`w-full flex items-center gap-3 p-2 rounded-full ${isUserMessage ? 'bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
      <audio ref={audioRef} src={src} onEnded={() => setIsPlaying(false)} />
      <button
        onClick={togglePlayPause}
        className={`size-8 flex-shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-90 ${themeClasses.buttonBg}`}
      >
        {isPlaying ? (
          <svg className={themeClasses.text} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-10a.5.5 0 0 0-.5-.5h-1zm7 0a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-10a.5.5 0 0 0-.5-.5h-1z"/>
          </svg>
        ) : (
          <svg className={themeClasses.text} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.27 3.03A.5.5 0 0 0 4 3.5v9a.5.5 0 0 0 .73.42l7-4.5a.5.5 0 0 0 0-.84l-7-4.5z"/>
          </svg>
        )}
      </button>
      <div className="flex-grow flex items-center gap-2">
        <div
          ref={progressRef}
          className={`w-full h-1.5 rounded-full cursor-pointer ${themeClasses.progressBg}`}
          onMouseDown={(e) => {
            setIsSeeking(true);
            handleSeek(e);
          }}
          onTouchStart={(e) => {
            setIsSeeking(true);
            handleSeek(e);
          }}
        >
          <div
            className={`h-full rounded-full ${themeClasses.progressFill}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className={`text-xs w-10 ${themeClasses.text}`}>
          {formatTime(currentTime)}
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  // Replace useChat with local state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [files, setFiles] = useState<FileList | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Reworked state for modes and tools
  const [activeTab, setActiveTab] = useState('modes');
  const [activeMode, setActiveMode] = useState('wild'); // 'safe' or 'wild'
  const [activeTool, setActiveTool] = useState<string | null>(null); // 'image', 'video', 'audio', 'voice'

  // Polling logic for long-running jobs
  useEffect(() => {
    const pendingMessages = messages.filter(m => m.status === 'pending' && m.replicateStreamUrl);
    if (pendingMessages.length === 0) return;

    const interval = setInterval(async () => {
      for (const message of pendingMessages) {
        try {
          const response = await fetch(`/api/status?replicateStreamUrl=${encodeURIComponent(message.replicateStreamUrl!)}`);
          const data = await response.json();

          if (data.status === 'completed') {
            // Update the message with the final result
            setMessages(prev => prev.map(m => 
              m.id === message.id ? { ...data.result, id: message.id } : m
            ));
          } else if (data.status === 'failed') {
            // Update the message to show an error
            setMessages(prev => prev.map(m => 
              m.id === message.id ? { ...m, status: 'failed', content: data.error } : m
            ));
          }
          // If 'processing', do nothing and wait for the next poll
        } catch (error) {
          console.error('Polling error:', error);
          // Mark as failed on network error
          setMessages(prev => prev.map(m => 
            m.id === message.id ? { ...m, status: 'failed', content: 'Failed to get status.' } : m
          ));
        }
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (event: React.FormEvent, options?: { experimental_attachments?: FileList }) => {
    event.preventDefault();
    
    if (!input.trim() && (!options?.experimental_attachments || options.experimental_attachments.length === 0)) {
      toast.error("Please enter a message or attach a file");
      return;
    }
    
    // Process attachments if provided
    const attachments = await processFilesToAttachments(options?.experimental_attachments || null);
    
    // Create user message
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: input,
      ...(attachments.length > 0 && { experimental_attachments: attachments })
    };
    
    // Update UI with user message
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    
    try {
      // Prepare the message payload
      const payload = {
        messages: [{
          role: userMessage.role,
          content: userMessage.content,
          ...(userMessage.experimental_attachments && { experimental_attachments: userMessage.experimental_attachments })
        }],
        chatId: localStorage.getItem('chatId') || uuidv4(),
        activeMode,
        activeTool,
      };

      // Store chatId for future messages
      if (!localStorage.getItem('chatId')) {
        localStorage.setItem('chatId', payload.chatId);
      }

      // Call the API route with just the latest message
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      // Check the content type of the response
      const contentType = response.headers.get('Content-Type') || '';
      
      if (contentType.includes('application/json')) {
        // Handle JSON response
        const data = await response.json();
        
        if (data.status === 'pending' && data.replicateStreamUrl) {
          // This is a long-running job, show a placeholder
          const pendingMessage: Message = {
            id: uuidv4(),
            role: 'assistant',
            status: 'pending',
            replicateStreamUrl: data.replicateStreamUrl,
            content: "Give me one second, Daddy...",
          };
          setMessages(prev => [...prev, pendingMessage]);
        } else {
          // This is a direct response
          const assistantMessage: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: data.content || data.text || "I received your message.",
            experimental_attachments: data.experimental_attachments || [],
          };
          setMessages(prev => [...prev, assistantMessage]);
        }
      } else if (contentType.includes('text/event-stream')) {
        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body cannot be read as stream');
        
        // Create a temporary message with empty content
        const assistantMessageId = uuidv4();
        setMessages(prev => [...prev, {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
        }]);
        
        let responseText = '';
        
        // Process the stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Convert the chunk to string
          const chunk = new TextDecoder().decode(value);
          
          // Process SSE format (data: lines)
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.choices && data.choices[0]?.delta?.content) {
                  responseText += data.choices[0].delta.content;
                  
                  // Update the message content with the latest chunk
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMessageId ? 
                    { ...m, content: responseText } : 
                    m
                  ));
                }
              } catch (err) {
                console.warn('Error parsing SSE data:', err);
              }
            }
          }
        }
      } else {
        // Handle plain text or other response types
        const text = await response.text();
        let contentToShow = text;

        if (text.startsWith('f:{"messageId":"')) {
          contentToShow = "Sorry that text didn't come through. Can you send it again?";
        }

        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: contentToShow,
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setIsLoading(false);

      // Toggle off the tool after use, unless it's voice chat
      if (activeTool && activeTool !== 'voice') {
        setActiveTool(null);
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const fileList: File[] = [];
    for (const item of items) {
      const file = item.getAsFile();
      if (file) {
        fileList.push(file);
      }
    }

    if (fileList.length > 0) {
      handleFiles(fileList);
    }
  };

  // Centralized file handler for drop, paste, and change events
  const handleFiles = (files: File[] | FileList) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      if (validateFile(file)) {
        validFiles.push(file);
      } else {
        errors.push(getFileValidationError(file));
      }
    }

    if (errors.length > 0) {
      setFileErrors(errors);
      toast.error(errors[0]);
    } else {
      const dataTransfer = new DataTransfer();
      validFiles.forEach(file => dataTransfer.items.add(file));
      setFiles(dataTransfer.files);
      setFileErrors([]);
      if (validFiles.length > 0) {
        toast.success(`${validFiles.length} file(s) ready to send`);
      }
    }
  };

  // File validation helper
  const validateFile = (file: File): boolean => {
    // Check file type if we're restricting based on ALLOWED_FILE_TYPES
    if (ALLOWED_FILE_TYPES.length > 0 && !ALLOWED_FILE_TYPES.includes(file.type)) {
      return false;
    }
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return false;
    }
    
    return true;
  };

  // Get validation error message
  const getFileValidationError = (file: File): string => {
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name}: File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    }
    
    if (ALLOWED_FILE_TYPES.length > 0 && !ALLOWED_FILE_TYPES.includes(file.type)) {
      return `${file.name}: File type not supported`;
    }
    
    return `${file.name}: Unknown error`;
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles);
    }
    setIsDragging(false);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    if (nearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Close lightbox on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Function to start a new chat
  const startNewChat = () => {
    // Clear messages
    setMessages([]);
    // Clear chat ID in localStorage
    localStorage.removeItem('chatId');
    // Clear any pending files
    setFiles(null);
    setFileErrors([]);
    // Clear input field
    setInput("");
  };

  // Function to handle file selection via the upload button
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Function to handle files selected from the file dialog
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      handleFiles(selectedFiles);
    }
  };

  return (
    <div
      className="flex flex-row justify-center pb-20 h-dvh bg-white dark:bg-zinc-900"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="fixed pointer-events-none dark:bg-zinc-900/90 h-dvh w-dvw z-10 flex flex-row justify-center items-center flex flex-col gap-1 bg-zinc-100/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div>Drag and drop files here</div>
            <div className="text-sm dark:text-zinc-400 text-zinc-500">
              {"(any file type, max 5MB)"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col justify-between h-full w-full">
        {/* Translucent Header */}
        <header className="fixed top-0 left-0 right-0 z-10 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md">
          <div className="w-full md:w-[600px] mx-auto flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="size-8 flex justify-center items-center bg-zinc-200 dark:bg-zinc-800 rounded-full">
                <BotIcon />
              </div>
              <div>
                <div className="font-semibold text-zinc-800 dark:text-zinc-200">AI Assistant</div>
                <div className="text-xs text-zinc-400 capitalize">
                  {activeMode} Mode
                  {activeTool && ` / ${activeTool} Gen`}
                </div>
              </div>
            </div>
            <button
              onClick={startNewChat}
              className="px-3 py-1 text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
              aria-label="Start a new chat"
            >
              New Chat
            </button>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto" ref={messagesContainerRef}>
          <div className="w-full md:w-[600px] mx-auto flex flex-col gap-5 px-4 pt-28 pb-4">
            {messages.length > 0 ? (
              messages.map((message) => (
                <React.Fragment key={message.id}>
                  {/* Render standalone attachments below the bubble */}
                  {message.experimental_attachments && message.experimental_attachments.length > 0 && (
                    <div className={`w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} pb-2`}>
                      <div className={`flex flex-col gap-2 ${message.role === 'assistant' ? 'pl-10' : ''}`}>
                        {message.experimental_attachments.map((attachment, idx) => {
                          if (attachment.contentType?.startsWith("image")) {
                            return (
                              <img
                                className="w-full max-w-[200px] rounded-md cursor-pointer"
                                key={`${attachment.name}-${idx}`}
                                src={attachment.url}
                                alt={attachment.name}
                                onClick={() => setLightbox({ url: attachment.url, type: 'image' })}
                              />
                            );
                          }
                          if (attachment.contentType?.startsWith("video")) {
                            return (
                              <video
                                controls
                                className="w-full max-w-[200px] h-auto rounded-md cursor-pointer"
                                key={`${attachment.name}-${idx}`}
                                onClick={() => setLightbox({ url: attachment.url, type: 'video' })}
                              >
                                <source src={attachment.url} type={attachment.contentType} />
                                Your browser does not support the video element.
                              </video>
                            );
                          }
                          if (attachment.contentType?.startsWith("audio")) {
                            return (
                              <div className="w-full max-w-[200px]" key={`${attachment.name}-${idx}`}>
                                <CustomAudioPlayer
                                  src={attachment.url}
                                  isUserMessage={message.role === 'user'}
                                />
                              </div>
                            );
                          }
                          // Fallback for other file types
                          return (
                            <div 
                              className={`w-full flex items-center gap-2 p-2 rounded-lg bg-zinc-200 dark:bg-zinc-800`}
                              key={`${attachment.name}-${idx}`}
                            >
                              <div className="text-2xl">
                                {getFileIcon(attachment.contentType || '')}
                              </div>
                              <div className="flex flex-col">
                                <a 
                                  href={attachment.url} 
                                  download={attachment.name}
                                  className={`text-xs font-medium hover:underline text-zinc-800 dark:text-zinc-200`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {attachment.name}
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Render the text bubble */}
                  {message.content && (
                    <div className={`w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <motion.div
                        className={`flex flex-row gap-2 items-end max-w-[85%]`}
                        initial={{ y: 5, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                      >
                        {message.role === 'assistant' && (
                          <div className="size-6 flex justify-center items-center flex-shrink-0 text-zinc-400 mb-1">
                            <BotIcon />
                          </div>
                        )}
                        <div className={`p-2 rounded-xl ${
                            message.role === 'user'
                              ? 'bg-blue-500 text-white rounded-br-none'
                              : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-none'
                          }`}
                        >
                          {message.content && <div className="text-sm"><Markdown>{message.content}</Markdown></div>}
                        </div>
                      </motion.div>
                    </div>
                  )}
                </React.Fragment>
              ))
            ) : (
              <motion.div className="h-full flex items-center justify-center">
                <div className="border rounded-lg p-6 flex flex-col gap-4 text-zinc-500 text-sm dark:text-zinc-400 dark:border-zinc-700 max-w-sm text-center">
                  <p className="flex flex-row justify-center gap-4 items-center text-zinc-900 dark:text-zinc-50 text-lg font-semibold">
                    AI Assistant
                  </p>
                  <p>
                    Start a conversation by typing a message below.
                  </p>
                  <p>
                    Tap the <span className="font-bold text-zinc-700 dark:text-zinc-300">+</span> button to explore creative modes and tools, or to upload from your Photo & Video Library.
                  </p>
                </div>
              </motion.div>
            )}
            {isLoading && (
              <div className="w-full flex justify-start">
                <motion.div
                  className="flex flex-row gap-2 items-end max-w-[85%]"
                  initial={{ y: 5, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                >
                  <div className="size-6 flex justify-center items-center flex-shrink-0 text-zinc-400 mb-1">
                    <BotIcon />
                  </div>
                  <div className="p-3 rounded-2xl bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-none">
                    <div className="flex gap-1 items-center">
                      <div className="size-2 bg-zinc-400 rounded-full animate-pulse delay-75" />
                      <div className="size-2 bg-zinc-400 rounded-full animate-pulse delay-150" />
                      <div className="size-2 bg-zinc-400 rounded-full animate-pulse delay-300" />
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* File errors display */}
        {fileErrors.length > 0 && (
          <div className="flex flex-col gap-1 px-4 w-full md:w-[500px] md:px-0">
            {fileErrors.map((error, idx) => (
              <div key={idx} className="text-xs text-red-500 dark:text-red-400">
                {error}
              </div>
            ))}
          </div>
        )}

        {/* Composer Form - now sticky to the bottom */}
        <div className="sticky bottom-0 w-full bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md">
          <div className="w-full md:w-[600px] mx-auto pt-4 px-4 pb-2">
            {/* File Previews */}
            <AnimatePresence>
              {files && files.length > 0 && (
                <motion.div
                  className="flex flex-row gap-2 mb-2 flex-wrap"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  {Array.from(files).map((file, idx) => (
                    <motion.div
                      key={`${file.name}-${idx}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="w-16 h-16"
                    >
                      {file.type.startsWith("image") ? (
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-full object-cover rounded-md"
                        />
                      ) : (
                        <FilePreview file={file} />
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Composer Form */}
            <div className="flex items-center gap-2">
              {/* Plus Button */}
              <button
                type="button"
                className="p-2 rounded-full text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                aria-label="Open menu"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>

              {/* Text Input Form */}
              <form
                className="relative w-full"
                onSubmit={(event) => {
                  handleSubmit(event, { experimental_attachments: files || undefined });
                  setFiles(null);
                  setFileErrors([]);
                }}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onPaste={handlePaste}
                  placeholder="Send a message..."
                  className="w-full border rounded-full px-4 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full ${
                    input.trim() || (files && files.length > 0)
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  } transition-all duration-200`}
                  aria-label="Send message"
                  disabled={isLoading || (!input.trim() && (!files || files.length === 0))}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Pop-up Menu - Replaced with Centered Modal */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
          >
            <motion.div
              className="w-full max-w-md bg-zinc-900/80 backdrop-blur-md text-white rounded-2xl border border-zinc-800 shadow-xl p-6"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Welcome to Eden</h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-1 rounded-full hover:bg-zinc-800">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              {/* Tab-like navigation */}
              <div className="bg-zinc-800 p-1 rounded-full flex mb-6">
                <button
                  className={`w-1/2 py-2 text-sm font-semibold rounded-full transition-colors ${
                    activeTab === 'modes' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-700/50'
                  }`}
                  onClick={() => setActiveTab('modes')}
                >
                  Modes
                </button>
                <button
                  className={`w-1/2 py-2 text-sm font-semibold rounded-full transition-colors ${
                    activeTab === 'tools' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-700/50'
                  }`}
                  onClick={() => setActiveTab('tools')}
                >
                  Tools
                </button>
              </div>

              {/* Menu Items */}
              {activeTab === 'modes' ? (
                <div className="flex flex-col gap-2">
                  <button
                    className={`w-full p-3 flex items-center justify-between rounded-lg transition-colors ${
                      activeMode === 'safe' ? 'bg-blue-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                    onClick={() => setActiveMode('safe')}
                  >
                    <div className="flex items-center gap-3">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                      <span>Safe Mode</span>
                    </div>
                    <span className="text-xs">Basic+</span>
                  </button>
                  <button
                    className={`w-full p-3 flex items-center justify-between rounded-lg transition-colors ${
                      activeMode === 'wild' ? 'bg-blue-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                    onClick={() => setActiveMode('wild')}
                  >
                    <div className="flex items-center gap-3">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                      <span>Wild Mode</span>
                    </div>
                    <span className="text-xs">Premium+</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'image', name: 'Image Generation', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg> },
                    { id: 'video', name: 'Video Generation', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 8-6 4 6 4V8z"></path><rect x="2" y="6" width="14" height="12" rx="2"></rect></svg> },
                    { id: 'audio', name: 'Audio Generation', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10v4"></path><path d="M6 8v8"></path><path d="M9 12v0"></path><path d="M12 6v12"></path><path d="M15 10v4"></path><path d="M18 8v8"></path><path d="M21 10v4"></path></svg> },
                    { id: 'voice', name: 'Voice Chat', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg> },
                  ].map(tool => (
                    <button
                      key={tool.id}
                      className={`w-full p-3 flex items-center justify-start gap-3 rounded-lg transition-colors ${
                        activeTool === tool.id ? 'bg-blue-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700'
                      }`}
                      onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
                    >
                      {tool.icon}
                      <span>{tool.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-zinc-800 my-4"/>

              <button
                className="w-full p-3 flex items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                onClick={() => {
                  handleUploadClick();
                  setIsMenuOpen(false);
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                <span>Photo & Video Library</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file input for the attachment button */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />

      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="fixed inset-0 bg-black/80 flex justify-center items-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
          >
            {lightbox.type === 'image' ? (
              <motion.img
                src={lightbox.url}
                className="max-h-[90vh] max-w-[90vw] rounded-lg"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              />
            ) : (
              <motion.video
                src={lightbox.url}
                controls
                autoPlay
                className="max-h-[90vh] max-w-[90vw] rounded-lg"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}