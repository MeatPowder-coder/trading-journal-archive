"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
    X,
    Send,
    Paperclip,
    Sparkles,
    Loader2,
    Image as ImageIcon,
    Plus,
    MessageSquare,
    Trash2,
    ChevronLeft,
    FileText,
    Music,
    Film,
    AlertTriangle,
    TrendingUp,
    LayoutDashboard,
    Calculator,
    Wallet2,
} from "lucide-react";
import Link from "next/link";
import { OpenTradeModal } from "@/components/OpenTradeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// ---------- Types ----------
interface ChatSession {
    id: string;
    title: string | null;
    trade_id: number | null;
    created_at: string;
    updated_at: string;
    message_count: number;
    agent_type?: 'TRADER' | 'ACCOUNTANT';
}

interface ChatInterfaceProps {
    tradeId?: number;
    tradeContext?: {
        simbolo: string;
        direccion: string;
        pnl_realizado: number;
    };
    mode?: "drawer" | "full";
    onClose?: () => void;
}

// ---------- Helpers ----------
/** Extract text content from a UIMessage (v5 uses parts array) */
function getMessageText(msg: any): string {
    // v5 UIMessage: parts array with { type: 'text', text: '...' }
    if (msg.parts) {
        let text = msg.parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("");
        if (text) {
            text = stripToolMarkers(text);
            return text.replace(/!\[[^\]]*]\(([^)]+)\)/g, "").trim();
        }
        // Fallback: show reasoning if no text parts
        const reasoning = msg.parts
            .filter((p: any) => p.type === "reasoning")
            .map((p: any) => p.text)
            .join("");
        return reasoning;
    }
    // Fallback for legacy content string
    if (typeof msg.content === "string") {
        const stripped = stripToolMarkers(msg.content);
        return stripped.replace(/!\[[^\]]*]\(([^)]+)\)/g, "").trim();
    }
    return "";
}

/** Extract image URLs from a UIMessage */
function getMessageImages(msg: any): string[] {
    const urls: string[] = [];
    if (msg.parts) {
        msg.parts.forEach((p: any) => {
            if (p.type === "file" && p.mediaType?.startsWith("image/")) {
                const url = p.url || p.data;
                if (url) urls.push(url);
            } else if (p.type === "text" && typeof p.text === "string") {
                const text = stripToolMarkers(p.text);
                const matches = text.matchAll(/!\[[^\]]*]\(([^)]+)\)/g);
                for (const m of matches) {
                    if (m[1]) urls.push(m[1]);
                }
            }
        });
    } else if (typeof msg.content === "string") {
        const stripped = stripToolMarkers(msg.content);
        const matches = stripped.matchAll(/!\[[^\]]*]\(([^)]+)\)/g);
        for (const m of matches) {
            if (m[1]) urls.push(m[1]);
        }
    }
    return urls;
}

function stripToolMarkers(text: string): string {
    return text.replace(/\[\[tool:propose_live_trade]]\s*({[\s\S]*})/g, "").trim();
}

function extractToolMarker(text: string): { cleanedText: string; toolArgs: any | null } {
    const match = text.match(/\[\[tool:propose_live_trade]]\s*({[\s\S]*})/);
    if (!match) return { cleanedText: text, toolArgs: null };
    let toolArgs: any = null;
    try {
        toolArgs = JSON.parse(match[1]);
    } catch {
        toolArgs = null;
    }
    const cleanedText = text.replace(match[0], "").trim();
    return { cleanedText, toolArgs };
}
function getToolParts(msg: any): any[] {
    if (!msg?.parts) return [];
    return msg.parts.filter((p: any) =>
        typeof p?.type === "string" &&
        (p.type.startsWith("tool-") || p.type === "dynamic-tool")
    );
}

function getToolAnalysis(toolParts?: any[]): string {
    if (!toolParts || toolParts.length === 0) return "";
    for (const tool of toolParts) {
        const toolName =
            tool.type === "dynamic-tool"
                ? tool.toolName
                : (tool.type?.startsWith("tool-") ? tool.type.slice(5) : tool.type);
        if (toolName === "propose_live_trade") {
            const input = tool.input || {};
            if (typeof input.analysis === "string" && input.analysis.trim()) {
                return input.analysis;
            }
            if (typeof input.reason === "string" && input.reason.trim()) {
                return input.reason;
            }
        }
    }
    return "";
}

const fileTypeIcon = (type: string) => {
    switch (type) {
        case "audio": return <Music className="h-4 w-4" />;
        case "video": return <Film className="h-4 w-4" />;
        case "document": return <FileText className="h-4 w-4" />;
        default: return <ImageIcon className="h-4 w-4" />;
    }
};

/** Minimal markdown to HTML (bold, italic, code) */
function formatMarkdown(text: string): string {
    return text
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" className="rounded-lg max-h-60 border border-zinc-200 dark:border-zinc-700 my-2" />')
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/\*(.+?)\*/g, "<i>$1</i>")
        .replace(/`([^`]+)`/g, '<code class="bg-black/20 dark:bg-white/10 px-1 rounded font-mono text-pink-500">$1</code>')
        .replace(/\n/g, "<br>");
}

// ---------- Chat Bubble ----------
// ---------- Trade Proposal Card ----------
const TradeProposalCard = ({ args, onExecute }: { args: any, onExecute: (args: any) => void }) => (
    <div className="mt-3 p-4 bg-white dark:bg-zinc-950 border border-blue-200 dark:border-blue-900 rounded-xl shadow-sm max-w-sm">
        <div className="flex items-center gap-2 mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-1.5 rounded-lg">
                <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Propuesta de Trade</span>
        </div>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm mb-4">
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Símbolo</span>
                <b className="text-zinc-900 dark:text-zinc-100">{args.symbol}</b>
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Dirección</span>
                <b className={`font-bold ${args.side === 'LONG' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{args.side}</b>
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Leverage</span>
                <b className="text-zinc-900 dark:text-zinc-100">{args.leverage}x</b>
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Margen</span>
                <b className="text-zinc-900 dark:text-zinc-100">${args.margin}</b>
            </div>
        </div>

        {args.reason && (
            <div className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800 mb-3 italic">
                "{args.reason}"
            </div>
        )}

        <Button
            onClick={() => onExecute(args)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-md transition-all active:scale-95"
            size="sm"
        >
            <TrendingUp className="h-3.5 w-3.5" />
            Revisar y Ejecutar
        </Button>
    </div>
);

// ---------- Chat Bubble ----------
// ---------- Chat Bubble ----------
const ChatBubble = memo(({ role, content, images, toolParts, onExecuteTrade }: {
    role: string;
    content: string;
    images?: string[];
    toolParts?: any[];
    onExecuteTrade?: (args: any) => void;
}) => {
    const isUser = role === "user";

    const toolAnalysis = !isUser && (!content || content.trim().length === 0)
        ? getToolAnalysis(toolParts)
        : "";
    const displayContent = content || toolAnalysis;

    return (
        <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300 gap-1`}>
            <div
                className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${isUser
                    ? "bg-blue-600 text-white rounded-tr-none"
                    : "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-tl-none border border-zinc-200 dark:border-zinc-800"
                    }`}
            >
                {images && images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                        {images.map((src, i) => (
                            <img key={i} src={src} alt="Attached" className="max-h-40 rounded-lg border border-white/20" />
                        ))}
                    </div>
                )}
                <div
                    className={`whitespace-pre-wrap ${!isUser ? "prose prose-sm dark:prose-invert max-w-none" : ""}`}
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(displayContent || (isUser ? "" : "<i>Analizando...</i>")) }}
                />
            </div>

            {/* Render Tool Invocations (Debug / Legacy) */}
            {!isUser && toolParts && toolParts.map((tool: any, index: number) => {
                const toolName =
                    tool.type === "dynamic-tool"
                        ? tool.toolName
                        : (tool.type?.startsWith("tool-") ? tool.type.slice(5) : tool.type);

                if (toolName === 'propose_live_trade' && onExecuteTrade) {
                    const args = tool.input ?? tool.output?.proposal ?? tool.output;
                    return (
                        <div key={tool.toolCallId || `${toolName}-${index}`} className="w-full mt-2">
                            {args ? (
                                <TradeProposalCard args={args} onExecute={onExecuteTrade} />
                            ) : (
                                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 font-mono">
                                    [DEBUG] Tool: {toolName} | Args: missing
                                </div>
                            )}
                        </div>
                    );
                }
                // Hide other debug boxes to clean up UI for user
                return null;
            })}
        </div>
    );
});
ChatBubble.displayName = "ChatBubble";

// ---------- Session Sidebar ----------
// ---------- Session Sidebar ----------
const SessionSidebar = memo(({
    sessions, activeId, onSelect, onCreate, onDelete, loading,
}: {
    sessions: ChatSession[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onCreate: (type: 'TRADER' | 'ACCOUNTANT') => void;
    onDelete: (id: string) => void;
    loading: boolean;
}) => {
    const accountantSessions = sessions.filter(s => s.agent_type === 'ACCOUNTANT');
    const traderSessions = sessions.filter(s => s.agent_type !== 'ACCOUNTANT');

    const SessionItem = ({ s }: { s: ChatSession }) => (
        <div
            onClick={() => onSelect(s.id)}
            className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b dark:border-zinc-900 group transition-colors ${activeId === s.id
                ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
        >
            {s.agent_type === 'ACCOUNTANT' ? (
                <Calculator className="h-4 w-4 flex-shrink-0 text-amber-500" />
            ) : (
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-blue-500" />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm truncate font-medium">{s.title || "Sin título"}</p>
                <p className="text-[10px] text-zinc-400">
                    {new Date(s.updated_at).toLocaleDateString("es-CO", { month: "short", day: "numeric" })}
                    {" · "}{s.message_count} msgs
                </p>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-opacity p-1"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );

    return (
        <div className="flex flex-col h-full w-full bg-zinc-50 dark:bg-zinc-950">
            {/* New Chat Actions */}
            <div className="p-2 grid grid-cols-2 gap-2 border-b dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm z-10">
                <Button onClick={() => onCreate('ACCOUNTANT')} size="sm" variant="outline" className="text-xs gap-1 border-dashed border-zinc-300 dark:border-zinc-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-600 dark:hover:text-amber-400">
                    <Calculator className="h-3.5 w-3.5" />
                    Contador
                </Button>
                <Button onClick={() => onCreate('TRADER')} size="sm" className="text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Trader
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Accountant Section */}
                {accountantSessions.length > 0 && (
                    <div className="flex flex-col">
                        <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-2 bg-zinc-100/50 dark:bg-zinc-900/50 sticky top-0 backdrop-blur-sm z-10">
                            <Wallet2 className="h-3 w-3" /> Finanzas
                        </div>
                        {accountantSessions.map((s) => (
                            <SessionItem key={s.id} s={s} />
                        ))}
                    </div>
                )}

                {/* Trader Section */}
                <div className="flex flex-col">
                    <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-2 bg-zinc-100/50 dark:bg-zinc-900/50 sticky top-0 backdrop-blur-sm z-10">
                        <TrendingUp className="h-3 w-3" /> Trading
                    </div>
                    {traderSessions.map((s) => (
                        <SessionItem key={s.id} s={s} />
                    ))}
                    {traderSessions.length === 0 && accountantSessions.length === 0 && !loading && (
                        <div className="p-8 text-center text-sm text-zinc-400 italic">
                            Crea un chat para comenzar
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});
SessionSidebar.displayName = "SessionSidebar";

// ---------- Main Component ----------
export function ChatInterface({ tradeId, tradeContext, mode = "full", onClose }: ChatInterfaceProps) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [pendingFile, setPendingFile] = useState<{ preview: string; type: string; mimeType?: string } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false); // Default closed to prevent hydration mismatch

    // Initialize sidebar state based on screen width
    useEffect(() => {
        if (mode === "full" && window.innerWidth >= 768) {
            setShowSidebar(true);
        }
    }, [mode]);
    const [selectedModel, setSelectedModel] = useState("gemini-3-flash-preview");
    const [chatError, setChatError] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState("");

    // Trade Execution Modal State
    const [tradeModalOpen, setTradeModalOpen] = useState(false);
    const [tradeModalValues, setTradeModalValues] = useState<any>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Use refs so the body function always reads latest values
    // without needing to recreate the transport (useChat caches internally)
    const sessionIdRef = useRef(activeSessionId);
    const modelRef = useRef(selectedModel);
    useEffect(() => { sessionIdRef.current = activeSessionId; }, [activeSessionId]);
    useEffect(() => { modelRef.current = selectedModel; }, [selectedModel]);

    // Stable transport — never recreated, body reads from refs
    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: "/api/chat",
                body: () => ({ sessionId: sessionIdRef.current, model: modelRef.current }),
            }),
        [] // eslint-disable-line react-hooks/exhaustive-deps
    );

    // AI SDK v5 useChat
    const {
        messages,
        setMessages,
        sendMessage,
        status,
        error,
    } = useChat({
        transport,
        onFinish: () => {
            setChatError(null);
            loadSessions();
        },
        onError: (err) => {
            console.error("Chat error:", err);
            // Intentar parsear el error si viene como string JSON o usar el mensaje directo
            let displayError = err.message || "Error de conexión con IA.";

            // Detección mejorada de errores de cuota para feedback al usuario
            if (err.message.includes("429") ||
                err.message.toLowerCase().includes("quota") ||
                err.message.toLowerCase().includes("limit") ||
                err.message.includes("Resource has been exhausted")) {
                displayError = "⚠️ Has excedido tu cuota de uso (429). Por favor cambia de modelo en el selector superior.";
            }

            setChatError(displayError);
        },
    });
    const isLoading = status === "streaming" || status === "submitted";

    // Catch streaming errors via the `error` property from useChat
    // This covers errors that happen DURING streaming (e.g., quota mid-stream)
    useEffect(() => {
        if (error && !chatError) {
            let msg = error.message || 'Error de conexión con IA.';
            if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource has been exhausted')) {
                msg = '⚠️ Has excedido tu cuota de uso (429). Por favor cambia de modelo en el selector superior.';
            }
            setChatError(msg);
        }
    }, [error]);

    // Load sessions
    const loadSessions = useCallback(async () => {
        try {
            const url = tradeId ? `/api/chat/sessions?tradeId=${tradeId}` : "/api/chat/sessions";
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            }
        } catch (err) {
            console.error("Error loading sessions:", err);
        } finally {
            setSessionsLoading(false);
        }
    }, [tradeId]);

    useEffect(() => { loadSessions(); }, [loadSessions]);

    // Auto-select or create session
    useEffect(() => {
        if (!sessionsLoading && sessions.length === 0 && !activeSessionId) {
            createSession();
        } else if (!sessionsLoading && sessions.length > 0 && !activeSessionId) {
            selectSession(sessions[0].id);
        }
    }, [sessionsLoading, sessions.length]);

    // Load messages when session changes
    const selectSession = useCallback(async (sessionId: string) => {
        setActiveSessionId(sessionId);
        setChatError(null);
        try {
            const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`);
            if (res.ok) {
                const data = await res.json();
                console.log("Loaded messages:", data);
                const extractImagesFromText = (text: string) => {
                    const urls: string[] = [];
                    const matches = text.matchAll(/!\[[^\]]*]\(([^)]+)\)/g);
                    for (const m of matches) {
                        if (m[1]) urls.push(m[1]);
                    }
                    const cleanedText = text.replace(/!\[[^\]]*]\(([^)]+)\)/g, "").trim();
                    return { cleanedText, urls };
                };
                const mapped = data.map((m: any) => ({
                    id: String(m.id),
                    role: m.role as "user" | "assistant",
                    parts: (() => {
                        const rawText = typeof m.content === "string" ? m.content : "";
                        const { cleanedText: textNoTool, toolArgs } = extractToolMarker(rawText);
                        const { cleanedText, urls } = extractImagesFromText(textNoTool);
                        const parts: any[] = [];
                        if (cleanedText) {
                            parts.push({ type: "text" as const, text: cleanedText });
                        }
                        urls.forEach((url) => {
                            const lower = url.toLowerCase();
                            let mediaType = "image/png";
                            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mediaType = "image/jpeg";
                            else if (lower.endsWith(".gif")) mediaType = "image/gif";
                            else if (lower.endsWith(".webp")) mediaType = "image/webp";
                            parts.push({ type: "file", mediaType, url });
                        });
                        if (m.file_url) {
                            const lower = String(m.file_url).toLowerCase();
                            let mediaType = m.file_type || "image/png";
                            if (!m.file_type) {
                                if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mediaType = "image/jpeg";
                                else if (lower.endsWith(".gif")) mediaType = "image/gif";
                                else if (lower.endsWith(".webp")) mediaType = "image/webp";
                            }
                            parts.push({ type: "file", mediaType, url: m.file_url });
                        }
                        if (toolArgs) {
                            parts.push({
                                type: "tool-propose_live_trade",
                                toolCallId: `persisted-${m.id}`,
                                state: "output-available",
                                input: toolArgs,
                                output: { proposal: toolArgs, success: true }
                            });
                        }
                        return parts.length > 0 ? parts : [{ type: "text" as const, text: "" }];
                    })(),
                    // Note: Legacy messages from DB won't have tool parts unless we store them. 
                    // For now, only new streaming messages will show cards.
                }));
                setMessages(mapped);
            }
        } catch (err) {
            console.error("Error loading messages:", err);
        }
    }, [setMessages]);

    // Create session
    const createSession = useCallback(async (agentType: 'TRADER' | 'ACCOUNTANT' = 'TRADER') => {
        try {
            const res = await fetch("/api/chat/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tradeId: tradeId || null,
                    agentType
                }),
            });
            if (res.ok) {
                const newSession = await res.json();
                setSessions((prev) => [newSession, ...prev]);
                setActiveSessionId(newSession.id);
                setMessages([]);
                setChatError(null);
            }
        } catch (err) {
            console.error("Error creating session:", err);
        }
    }, [tradeId, setMessages]);

    // Delete session
    const deleteSession = useCallback(async (id: string) => {
        try {
            await fetch(`/api/chat/sessions?id=${id}`, { method: "DELETE" });
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (activeSessionId === id) {
                setActiveSessionId(null);
                setMessages([]);
            }
        } catch (err) {
            console.error("Error deleting session:", err);
        }
    }, [activeSessionId, setMessages]);

    // File upload
    const handleFileUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            let type = "document";
            if (file.type.startsWith("image/")) type = "image";
            else if (file.type.startsWith("audio/")) type = "audio";
            else if (file.type.startsWith("video/")) type = "video";
            setPendingFile({ preview: e.target?.result as string, type, mimeType: file.type });
        };
        reader.readAsDataURL(file);
    }, []);

    // Load Trade Screenshot (Manual)
    const handleLoadTradeScreenshot = useCallback(async () => {
        if (!tradeContext || !tradeId) return;

        // Aquí asumimos que tradeContext tiene screenshot_url. 
        // Si no lo tenemos en el contexto del frontend, podríamos necesitar hacer fetch al trade
        // Pero intentemos usar lo que tenemos o deducirlo.
        // Si el trade tiene screenshot, suele estar en public/uploads/trades/... 
        // Si no está en context, hacemos un fetch rápido para verificar

        try {
            // Fetch para obtener datos frescos del trade incluyendo screenshot_url
            const res = await fetch(`/api/trades/${tradeId}`);
            let screenshotUrl = null;

            if (res.ok) {
                const tradeData = await res.json();
                screenshotUrl = tradeData.screenshot_url;
            } else if (tradeContext && 'screenshot_url' in tradeContext) {
                // Fallback si la API de trades falla pero lo tenemos en context (si existiera)
                screenshotUrl = (tradeContext as any).screenshot_url;
            }

            if (!screenshotUrl) {
                setChatError("No hay gráfico guardado para este trade.");
                return;
            }

            // Convert URL to Blob/Base64 for pendingFile
            const imgRes = await fetch(screenshotUrl);
            const blob = await imgRes.blob();
            const file = new File([blob], "trade_screenshot.png", { type: "image/png" });
            handleFileUpload(file);

        } catch (err) {
            console.error("Error loading trade screenshot:", err);
            setChatError("Error al cargar la imagen del trade.");
        }
    }, [tradeId, tradeContext, handleFileUpload]);

    // Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }
    }, [messages, isLoading]);

    // Drop handler
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    }, [handleFileUpload]);

    // Paste handler
    const onPaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                if (file) { handleFileUpload(file); break; }
            }
        }
    }, [handleFileUpload]);

    // Submit handler
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() && !pendingFile) return;
        if (!activeSessionId) return;

        setChatError(null);
        const text = inputValue;
        const fileToSend = pendingFile;
        setInputValue("");
        setPendingFile(null);

        try {
            // Build file parts array (SDK v6 UI message stream)
            const files = fileToSend
                ? [{
                    type: 'file',
                    mediaType: fileToSend.mimeType || 'image/png',
                    url: fileToSend.preview,
                    filename: 'upload'
                }]
                : undefined;

            const hasText = text.trim().length > 0;
            if (files) {
                const textToSend = hasText ? text : "Analiza este archivo";
                await sendMessage({ text: textToSend, files } as any);
            } else {
                await sendMessage({ text } as any);
            }
        } catch (err: any) {
            console.error("Send error:", err);
            setChatError(err.message || "Error al enviar mensaje");
        }
    }, [inputValue, pendingFile, activeSessionId, sendMessage]);

    // ---------- Render ----------
    const isDrawer = mode === "drawer";
    // Now that AppLayout handles the screen height and mobile header, 
    // ChatInterface should just fill the available space (which is main h-full)
    return (
        <div className={`flex ${isDrawer ? "h-full" : "h-full"} bg-white dark:bg-zinc-950`}>
            {/* Trade Execution Modal */}
            <OpenTradeModal
                open={tradeModalOpen}
                onOpenChange={setTradeModalOpen}
                initialValues={tradeModalValues}
                chatSessionId={activeSessionId || undefined}
                showTrigger={false}
            />

            {/* Sidebar Mobile Overlay */}
            {showSidebar && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 md:hidden animate-in fade-in"
                    onClick={() => setShowSidebar(false)}
                />
            )}

            {/* Sidebar (Fixed Drawer on Mobile, Relative Flex on Desktop) */}
            <div className={`
                fixed inset-y-0 left-0 z-40 w-64 bg-zinc-50 dark:bg-zinc-950 border-r dark:border-zinc-800 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
                ${showSidebar ? "translate-x-0" : "-translate-x-full md:hidden"}
            `}>
                <SessionSidebar
                    sessions={sessions} activeId={activeSessionId}
                    onSelect={(id) => {
                        selectSession(id);
                        if (window.innerWidth < 768) setShowSidebar(false);
                    }}
                    onCreate={(type) => {
                        createSession(type);
                        if (window.innerWidth < 768) setShowSidebar(false);
                    }}
                    onDelete={deleteSession} loading={sessionsLoading}
                />
            </div>

            <div
                className="flex-1 flex flex-col min-w-0"
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
            >
                {/* Header */}
                <div className="p-3 border-b dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 shrink-0">
                    <div className="flex items-center gap-2">
                        {/* Session Sidebar Toggle - Mobile Only */}
                        {!showSidebar && (
                            <>
                                <Button variant="ghost" size="icon" onClick={() => setShowSidebar(true)} className="rounded-full md:hidden">
                                    {/* History Icon for "Past Chats" */}
                                    <MessageSquare className="h-5 w-5" />
                                </Button>
                                {/* Direct "New Chat" button for mobile */}
                                <Button variant="ghost" size="icon" onClick={() => createSession('TRADER')} className="rounded-full md:hidden text-blue-500">
                                    <Plus className="h-6 w-6" />
                                </Button>
                            </>
                        )}
                        {showSidebar && isDrawer && (
                            <Button variant="ghost" size="icon" onClick={() => setShowSidebar(false)} className="rounded-full">
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                        )}
                        {showSidebar && isDrawer && (
                            <Button variant="ghost" size="icon" onClick={() => setShowSidebar(false)} className="rounded-full">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        )}



                        <Sparkles className="h-4 w-4 text-blue-500" />
                        <div className="flex flex-col">
                            <h3 className="font-bold text-sm text-zinc-900 dark:text-white leading-none">
                                {tradeContext ? `Trade #${tradeId} · ${tradeContext.simbolo}` : "Agentame Chat"}
                            </h3>
                            {tradeContext && (
                                <span className={`text-[10px] font-bold ${tradeContext.pnl_realizado >= 0 ? "text-green-500" : "text-red-500"}`}>
                                    {tradeContext.pnl_realizado >= 0 ? "+" : ""}{tradeContext.pnl_realizado?.toFixed(2)} USD
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                            <SelectTrigger className="min-w-[140px] h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                                <SelectValue placeholder="Modelo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gemini-3-flash-preview">⚡ Gemini 3 Flash</SelectItem>
                                <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                                <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                                <div className="px-2 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">OpenAI</div>
                                <SelectItem value="gpt-5.2">GPT-5.2</SelectItem>
                                <SelectItem value="gpt-5.2-pro">GPT-5.2 Pro</SelectItem>
                                <SelectItem value="gpt-5-mini">GPT-5 Mini</SelectItem>
                                <SelectItem value="gpt-5-nano">GPT-5 Nano</SelectItem>
                            </SelectContent>
                        </Select>

                        {isDrawer && onClose && (
                            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8">
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 relative scroll-smooth">

                    {isDragging && (
                        <div className="absolute inset-2 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-xl flex items-center justify-center z-20 pointer-events-none animate-in zoom-in-95 duration-200">
                            <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-lg flex flex-col items-center gap-2">
                                <ImageIcon className="h-8 w-8 text-blue-500" />
                                <p className="font-bold text-sm">Suelta el archivo aquí</p>
                            </div>
                        </div>
                    )}

                    {messages.length === 0 && !isLoading && !chatError && (
                        <div className="flex flex-col items-center justify-center h-full text-center text-zinc-400 gap-3">
                            <Sparkles className="h-10 w-10 text-blue-500/30" />
                            <p className="text-sm">Escribe un mensaje para comenzar</p>
                            <p className="text-xs max-w-[250px] opacity-70">
                                Usa el selector arriba para cambiar de modelo si experimentas errores de cuota.
                            </p>
                        </div>
                    )}

                    {messages.map((msg: any) => (
                        <ChatBubble
                            key={msg.id}
                            role={msg.role}
                            content={getMessageText(msg)}
                            images={getMessageImages(msg)}
                            toolParts={getToolParts(msg)}
                            onExecuteTrade={(args) => {
                                setTradeModalValues(args);
                                setTradeModalOpen(true);
                            }}
                        />
                    ))}

                    {isLoading && (
                        <div className="flex justify-start animate-in fade-in duration-300">
                            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl rounded-tl-none p-3 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2 shadow-sm">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                <span className="text-xs text-zinc-500 font-medium italic">Pensando...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="p-3 border-t dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
                    {chatError && (
                        <div className="mb-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 p-3 rounded-xl flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 shadow-sm">
                            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-red-500" />
                            <div className="flex-1">
                                <p className="font-bold text-sm">Error de Conexión</p>
                                <p className="text-sm mt-0.5 whitespace-pre-wrap">{chatError}</p>
                            </div>
                            <button onClick={() => setChatError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-200 shrink-0 p-1">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                    {pendingFile && (
                        <div className="mb-2 relative w-fit group animate-in zoom-in-95 duration-200">
                            {pendingFile.type === "image" ? (
                                <img src={pendingFile.preview} alt="Preview" className="h-20 w-auto rounded-xl border-2 border-blue-500 shadow-lg object-cover" />
                            ) : (
                                <div className="h-16 px-4 rounded-xl border-2 border-blue-500 shadow-lg flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900">
                                    {fileTypeIcon(pendingFile.type)}
                                    <span className="text-xs font-medium">{pendingFile.type}</span>
                                </div>
                            )}
                            <button
                                onClick={() => setPendingFile(null)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-xl hover:bg-red-600"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="flex items-center gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                        />
                        {tradeId && (
                            <Button
                                type="button" variant="ghost" size="icon"
                                onClick={handleLoadTradeScreenshot}
                                className="text-zinc-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-full transition-colors"
                                title="Adjuntar Gráfico del Trade"
                            >
                                <ImageIcon className="h-5 w-5" />
                            </Button>
                        )}
                        <Button
                            type="button" variant="ghost" size="icon"
                            className="text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Paperclip className="h-5 w-5" />
                        </Button>
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onPaste={onPaste}
                            placeholder={`Mensaje a ${selectedModel}...`}
                            className="flex-1 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl focus-visible:ring-blue-500"
                            disabled={isLoading || !activeSessionId}
                        />
                        <Button
                            type="submit" size="icon"
                            disabled={isLoading || (!inputValue.trim() && !pendingFile) || !activeSessionId}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full h-10 w-10 shadow-md transition-all active:scale-95"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                    <p className="text-[10px] text-zinc-400 mt-1.5 text-center">
                        Ctrl + V para imágenes · Arrastra archivos
                    </p>
                </div>
            </div>
        </div>
    );
}
