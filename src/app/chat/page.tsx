"use client";

import { ChatInterface } from "@/components/ChatInterface";

export default function ChatPage() {
    return (
        <div className="h-full bg-white dark:bg-zinc-950">
            <ChatInterface mode="full" />
        </div>
    );
}
