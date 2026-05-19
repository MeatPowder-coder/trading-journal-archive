import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChatSession,
  listChatMessages,
  listChatSessions,
  streamChatMessage,
} from '../lib/api';
import type { ChatMessage, ChatSession, DesktopTokens } from '../types';

function fmt(iso: string | undefined) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function isLoginRedirectError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error || '');
  const normalized = text.toLowerCase();
  return normalized.includes('/login?callbackurl') || normalized.includes('cannot post /login');
}

export function ChatDesk({
  backendUrl,
  tokens,
  activeTradeId,
}: {
  backendUrl: string;
  tokens: DesktopTokens | null;
  activeTradeId: number | null;
}) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Chat ready');
  const bootKeyRef = useRef('');

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) || null,
    [sessionId, sessions]
  );

  const loadMessages = useCallback(
    async (targetSessionId: number) => {
      if (!tokens?.accessToken) return;
      const payload = await listChatMessages({
        baseUrl: backendUrl,
        accessToken: tokens.accessToken,
        sessionId: targetSessionId,
      });
      setMessages(payload.messages || []);
    },
    [backendUrl, tokens?.accessToken]
  );

  const ensureDefaultSession = useCallback(async () => {
    if (!tokens?.accessToken) return null;

    const sessionPayload = await listChatSessions({
      baseUrl: backendUrl,
      accessToken: tokens.accessToken,
      tradeId: activeTradeId || undefined,
    });

    const list = sessionPayload.sessions || [];
    if (list.length > 0) {
      setSessions(list);
      return list[0].id;
    }

    const created = await createChatSession({
      baseUrl: backendUrl,
      accessToken: tokens.accessToken,
      body: {
        title: activeTradeId ? `Trade ${activeTradeId}` : 'Desktop chat',
        tradeId: activeTradeId || null,
        agentType: 'TRADER',
      },
    });

    setSessions([created.session]);
    return created.session.id;
  }, [activeTradeId, backendUrl, tokens?.accessToken]);

  useEffect(() => {
    if (!tokens?.accessToken) {
      bootKeyRef.current = '';
      return;
    }
    const bootKey = `${tokens.accessToken.slice(0, 20)}:${activeTradeId || 0}`;
    if (bootKeyRef.current === bootKey) return;
    bootKeyRef.current = bootKey;

    let cancelled = false;
    async function boot() {
      try {
        const nextSessionId = await ensureDefaultSession();
        if (cancelled || !nextSessionId) return;
        setSessionId(nextSessionId);
        await loadMessages(nextSessionId);
      } catch (error) {
        if (!cancelled) {
          if (isLoginRedirectError(error)) {
            setStatus('Chat unavailable in current backend (missing /v1/chat routes)');
            return;
          }
          setStatus(error instanceof Error ? error.message : 'Could not load chat');
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [ensureDefaultSession, loadMessages, tokens?.accessToken]);

  async function handleSelectSession(id: number) {
    setSessionId(id);
    setStatus('Loading chat history...');
    try {
      await loadMessages(id);
      setStatus('Chat ready');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load messages');
    }
  }

  async function handleCreateSession() {
    if (!tokens?.accessToken) return;
    setBusy(true);
    setStatus('Creating new session...');
    try {
      const created = await createChatSession({
        baseUrl: backendUrl,
        accessToken: tokens.accessToken,
        body: {
          title: `Desktop ${new Date().toLocaleTimeString()}`,
          tradeId: activeTradeId || null,
          agentType: 'TRADER',
        },
      });
      const next = [created.session, ...sessions];
      setSessions(next);
      setSessionId(created.session.id);
      setMessages([]);
      setStatus('New session ready');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create chat session');
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!tokens?.accessToken || !sessionId) return;
    const text = prompt.trim();
    if (!text) return;

    setBusy(true);
    setStatus('Waiting for assistant response...');
    const optimistic: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setPrompt('');

    try {
      const response = await streamChatMessage({
        baseUrl: backendUrl,
        accessToken: tokens.accessToken,
        sessionId,
        message: text,
        model: 'gemini-3.1-flash-lite-preview',
      });

      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        optimistic,
        response.assistantMessage,
      ]);
      setStatus(`Response from ${response.model}`);
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setStatus(error instanceof Error ? error.message : 'Assistant request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chat-workspace">
      <aside className="chat-sessions-panel">
        <div className="card-title-row">
          <h3>Chat Sessions</h3>
          <button className="btn" onClick={handleCreateSession} disabled={busy || !tokens}>New</button>
        </div>
        <div className="chat-session-list">
          {sessions.map((session) => (
            <button
              key={session.id}
              className={session.id === sessionId ? 'chat-session active' : 'chat-session'}
              onClick={() => handleSelectSession(session.id)}
            >
              <b>{session.title || `Session #${session.id}`}</b>
              <small>{fmt(session.updated_at)}</small>
            </button>
          ))}
          {!sessions.length ? <p className="muted">No sessions yet.</p> : null}
        </div>
      </aside>

      <article className="chat-thread-panel">
        <div className="card-title-row">
          <h3>{selectedSession?.title || 'Desktop Chat'}</h3>
          <span className="tag">{status}</span>
        </div>

        <div className="chat-thread-scroll">
          {messages.map((message) => (
            <div key={message.id} className={message.role === 'assistant' ? 'chat-bubble assistant' : 'chat-bubble user'}>
              <header>
                <b>{message.role.toUpperCase()}</b>
                <small>{fmt(message.created_at)}</small>
              </header>
              <p>{message.content}</p>
            </div>
          ))}
          {!messages.length ? <p className="muted">Start by sending a message.</p> : null}
        </div>

        <div className="chat-compose">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask for trade analysis, risk review, or journaling guidance..."
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={busy || !tokens || !sessionId}>
            {busy ? 'Sending...' : 'Send'}
          </button>
        </div>
      </article>
    </section>
  );
}
