
"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { AppSidebar, MobileSidebar } from "./AppSidebar";
import { AnimatedBackground } from "./AnimatedBackground";
import { cn } from "@/lib/utils";

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isChat = pathname === "/chat";
    const isDesktopEmbed = searchParams.get("desktopEmbed") === "1";

    return (
        <div className="flex h-screen md:h-screen sm:h-[100dvh] bg-background overflow-hidden relative z-0">
            <AnimatedBackground />

            {/* Desktop Sidebar - Fixed width, hidden on mobile */}
            {!isDesktopEmbed && (
                <div className="hidden md:flex flex-col fixed inset-y-0 z-50 h-full">
                    <AppSidebar />
                </div>
            )}

            {/* Main Content Area - Offset by COLLAPSED sidebar width on desktop */}
            <div className={cn(
                "flex-1 flex flex-col h-full w-full transition-all duration-300",
                isDesktopEmbed ? "md:pl-0" : "md:pl-20"
            )}>

                {/* Mobile Header - Visible only on mobile */}
                {!isDesktopEmbed && (
                    <div className="md:hidden flex items-center h-14 px-4 border-b bg-zinc-900 border-zinc-800 shrink-0 z-40 relative">
                        <MobileSidebar />
                        <span className="ml-3 font-bold text-white text-lg">TradingJournal</span>
                    </div>
                )}

                {/* Scrollable Page Content 
                    - If Chat: overflow-hidden (Chat handles its own scroll)
                    - If other: overflow-y-auto
                */}
                <main className={cn(
                    "flex-1 relative",
                    isChat && !isDesktopEmbed ? "overflow-hidden" : "overflow-y-auto"
                )}>
                    {children}
                </main>
            </div>
        </div>
    );
}
