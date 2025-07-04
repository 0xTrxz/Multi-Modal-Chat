# iMessage UI Theme: Implementation Plan

This document outlines the plan to transform the chat application's UI into a theme that resembles Apple's iMessage, complete with bubble-style messages, clean layouts, and fluid animations.

---

### **1. Core Styling Changes (The "iMessage" Look)**

-   **Chat Bubbles:**
    -   **User Messages:** Blue, rounded rectangles, right-aligned. A subtle gradient can be used for a modern touch.
    -   **Assistant Messages:** Light gray, rounded rectangles, left-aligned.
    -   **Tail Shape:** Add a small "tail" to each bubble pointing towards the sender. This can be achieved with CSS pseudo-elements (`::before` or `::after`).
-   **Background:**
    -   **Light Mode:** Clean, simple white (`#FFFFFF`).
    -   **Dark Mode:** A very dark gray/off-black (`#000000` or `#121212`).
-   **Typography:**
    -   Switch to a system font stack to closely resemble the native iOS look and feel.
    -   Increase base font size for better readability within bubbles.

---

### **2. Message List and Layout**

-   **Full-Width Container:** The message list will span the full width of its parent, allowing bubbles to be aligned to the far left and right edges.
-   **Padding and Spacing:** Increase vertical spacing between messages to give them room to "breathe" and enhance clarity.
-   **Avatars:** User and Assistant avatars will be positioned correctly next to their respective bubbles.

---

### **3. Attachments and Media**

-   **Placement:** All attachments (images, videos, audio players) will be rendered *inside* the chat bubble, above any text content.
-   **Styling:**
    -   **Images/Videos:** Will have rounded corners that match the bubble's curvature, creating a seamless look.
    -   **Audio Player:** The custom audio player will be restyled to fit the blue/gray bubble themes, removing any conflicting background colors or borders.
    -   **File Links:** Generic file attachments will be rendered as a clean, styled block within the bubble, showing the filename and a relevant icon.

---

### **4. Input Area (Composer)**

-   **Rounded Input Field:** The text input at the bottom will be a rounded, "pill-shaped" container, similar to the iMessage composer.
-   **Send Button:** A simple, circular button with a "send" icon (e.g., an upward-facing arrow). The button will be disabled/grayed out when the input is empty and turn blue when there's text to send.
-   **Attachment Button:** A circular button with a `+` or paperclip icon next to the input field for triggering the file upload.

---

### **5. Transition Animations (using Framer Motion)**

-   **New Messages:**
    -   Messages will animate in with a combination of a gentle slide-up and fade-in effect.
    -   The bubble will have a subtle "pop" or scale-in animation to feel more dynamic.
-   **Typing Indicator:** When the assistant is "typing," a bubble with an animated ellipsis (...) will appear, pulsing gently.
-   **Composer Animations:**
    -   The "Send" button will animate its color change smoothly.
    -   When files are selected for upload, their previews will animate into view above the composer.

---

### **Implementation Phases**

This project will be executed in sequential phases to ensure a smooth and manageable transition:

1.  **Phase 1: Chat Bubbles & Layout** - Implement the core bubble styles, alignment, and background changes.
2.  **Phase 2: Attachments** - Move attachment rendering logic inside the bubbles and apply iMessage-style themes.
3.  **Phase 3: Composer/Input** - Restyle the bottom input area and buttons.
4.  **Phase 4: Animations** - Integrate all transition animations for a fluid user experience. 