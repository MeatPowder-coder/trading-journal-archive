
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
    Bell,
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
            label: "Alertas",
            icon: Bell,
            href: "/?tab=alertas",
            active: pathname === "/" && currentTab === "alertas",
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
        <div className={cn("space-y-4 pt-14 pb-4 flex flex-col h-full bg-zinc-900 text-white transition-all duration-300 overflow-x-hidden", collapsed ? "items-center" : "")}>
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
            className={cn(
                "relative flex flex-col h-full bg-zinc-900/95 backdrop-blur-sm transition-[width] duration-300 ease-out z-50 shadow-xl border-r border-zinc-800 overflow-x-hidden",
                className,
                collapsed ? "w-20" : "w-64"
            )}
        >
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                <button
                    type="button"
                    onClick={() => setCollapsed((prev) => !prev)}
                    className={cn(
                        "h-9 rounded-full border border-zinc-700/80 bg-zinc-900/90 text-zinc-200 hover:text-white hover:border-cyan-500/70",
                        "flex items-center gap-1.5 px-3 shadow-lg shadow-black/30 transition-all"
                    )}
                    aria-label={collapsed ? "Expandir sidebar" : "Contraer sidebar"}
                    title={collapsed ? "Expandir" : "Contraer"}
                >
                    <Menu className="h-4 w-4" />
                    {!collapsed && <span className="text-xs font-medium">Menú</span>}
                </button>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className={cn(
                "absolute -right-3 top-14 h-6 w-6 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-500 flex items-center justify-center shadow-md",
                "transition-colors"
              )}
              aria-hidden
              tabIndex={-1}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
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
                <div className="sr-only">
                    <SheetTitle>Navigation Menu</SheetTitle>
                    <SheetDescription>Main application navigation</SheetDescription>
                </div>
                <SidebarContent collapsed={false} />
            </SheetContent>
        </Sheet>
    );
}
