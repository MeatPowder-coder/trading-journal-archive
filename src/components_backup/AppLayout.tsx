
"use client";

import { usePathname } from "next/navigation";
import { AppSidebar, MobileSidebar } from "./AppSidebar";
import { cn } from "@/lib/utils";

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isChat = pathname === "/chat";

    return (
        <div className="flex h-screen md:h-screen sm:h-[100dvh] bg-zinc-50 dark:bg-zinc-950 overflow-hidden">

            {/* Desktop Sidebar - Fixed width, hidden on mobile */}
            <div className="hidden md:flex flex-col fixed inset-y-0 z-50 h-full">
                <AppSidebar />
            </div>

            {/* Main Content Area - Offset by COLLAPSED sidebar width on desktop */}
            <div className="flex-1 flex flex-col md:pl-20 h-full w-full transition-all duration-300">

                {/* Mobile Header - Visible only on mobile */}
                <div className="md:hidden flex items-center h-14 px-4 border-b bg-zinc-900 border-zinc-800 shrink-0 z-40 relative">
                    <MobileSidebar />
                    <span className="ml-3 font-bold text-white text-lg">TradingJournal</span>
                </div>

                {/* Scrollable Page Content 
                    - If Chat: overflow-hidden (Chat handles its own scroll)
                    - If other: overflow-y-auto
                */}
                <main className={cn(
                    "flex-1 relative",
                    isChat ? "overflow-hidden" : "overflow-y-auto"
                )}>
                    {children}
                </main>
            </div>
        </div>
    );
}
