
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    LayoutDashboard,
    MessageSquare,
    FolderOpen,
    Zap,
    LogOut,
    Menu,
    PieChart,
    Wallet,
    Receipt,
    TrendingUp,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { ThemeSelector } from "@/components/ThemeSelector";
import { signOut } from "next-auth/react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useState } from "react";

// Helper for content (reused)
const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentTab = searchParams.get("tab");

    const routes = [
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            href: "/",
            active: pathname === "/" && !currentTab,
        },
        {
            label: "Trading",
            icon: TrendingUp,
            href: "/?tab=trading",
            active: pathname === "/" && currentTab === "trading",
        },
        {
            label: "Portafolio",
            icon: PieChart,
            href: "/?tab=portfolio",
            active: pathname === "/" && currentTab === "portfolio",
        },
        {
            label: "Cuentas",
            icon: Wallet,
            href: "/?tab=cuentas",
            active: pathname === "/" && currentTab === "cuentas",
        },
        {
            label: "Transacciones",
            icon: Receipt,
            href: "/?tab=transacciones",
            active: pathname === "/" && currentTab === "transacciones",
        },
        {
            label: "AI Chat",
            icon: MessageSquare,
            href: "/chat",
            active: pathname === "/chat",
        },
        {
            label: "Archivos",
            icon: FolderOpen,
            href: "/admin/files",
            active: pathname === "/admin/files",
        },
    ];

    return (
        <div className={cn("space-y-4 py-4 flex flex-col h-full bg-zinc-900 text-white transition-all duration-300", collapsed ? "items-center" : "")}>
            <div className="px-3 py-2 flex-1 w-full">
                <Link href="/" className={cn("flex items-center mb-14 pl-3 transition-all", collapsed ? "justify-center pl-0" : "")}>
                    <div className="relative h-8 w-8 bg-white text-black p-1.5 rounded-lg flex items-center justify-center shrink-0">
                        <Zap className="h-5 w-5 fill-current" />
                    </div>
                    {!collapsed && (
                        <h1 className="text-xl font-bold ml-4 animate-in fade-in duration-300 truncate">
                            TradingJournal
                        </h1>
                    )}
                </Link>
                <div className="space-y-1 w-full">
                    {routes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            title={collapsed ? route.label : undefined}
                            className={cn(
                                "text-sm group flex p-3 w-full font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition-all",
                                route.active ? "text-white bg-white/10" : "text-zinc-400",
                                collapsed ? "justify-center" : "justify-start"
                            )}
                        >
                            <div className="flex items-center">
                                <route.icon className={cn("h-5 w-5 shrink-0", collapsed ? "" : "mr-3", route.active ? "text-blue-500" : "text-zinc-400 group-hover:text-blue-500")} />
                                {!collapsed && <span className="truncate">{route.label}</span>}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            <div className={cn("px-3 py-2 border-t border-zinc-800 w-full", collapsed ? "flex flex-col items-center" : "")}>
                <div className={cn("flex items-center mb-4 transition-all duration-300", collapsed ? "justify-center" : "px-2")}>
                    <ThemeSelector collapsed={collapsed} />
                </div>
                <Button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    variant="ghost"
                    size={collapsed ? "icon" : "default"}
                    className={cn("w-full text-zinc-400 hover:text-white hover:bg-white/10", collapsed ? "justify-center" : "justify-start")}
                    title="Cerrar Sesión"
                >
                    <LogOut className={cn("h-5 w-5", collapsed ? "" : "mr-3")} />
                    {!collapsed && "Cerrar Sesión"}
                </Button>
            </div>
        </div>
    );
};

export function AppSidebar({ className }: { className?: string }) {
    const [collapsed, setCollapsed] = useState(true);

    return (
        <div
            className={cn("flex flex-col h-full bg-zinc-900 transition-all duration-300 z-50 shadow-xl border-r border-zinc-800", className, collapsed ? "w-20" : "w-64")}
            onMouseEnter={() => setCollapsed(false)}
            onMouseLeave={() => setCollapsed(true)}
        >
            <SidebarContent collapsed={collapsed} />
        </div>
    );
}

export function MobileSidebar() {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden text-white hover:bg-zinc-800">
                    <Menu className="h-6 w-6" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-zinc-900 border-r-zinc-800 w-72 text-white border-none flex flex-col">
                <VisuallyHidden>
                    <SheetTitle>Navigation Menu</SheetTitle>
                    <SheetDescription>Main application navigation</SheetDescription>
                </VisuallyHidden>
                <SidebarContent collapsed={false} />
            </SheetContent>
        </Sheet>
    );
}
