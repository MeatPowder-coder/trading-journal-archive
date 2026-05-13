import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query } from '@/lib/db';

// GET: Listar sesiones del usuario
export async function GET(req: NextRequest) {
    try {
        const session = await getAuthSession();
        console.log('[SESSIONS GET] Auth:', session ? `userId=${session.userId}` : 'NO SESSION');
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const tradeId = searchParams.get('tradeId');
        const pendingOrderId = searchParams.get('pendingOrderId');

        let sql: string;
        let params: any[];

        if (tradeId) {
            sql = `SELECT s.id, s.title, s.trade_id, s.pending_limit_order_id, s.created_at, s.updated_at, s.agent_type,
             (SELECT COUNT(*) FROM react_chat_messages WHERE session_id = s.id) as message_count
           FROM react_chat_sessions s
           WHERE s.user_id = $1 AND s.trade_id = $2
           ORDER BY s.updated_at DESC`;
            params = [session.userId, parseInt(tradeId)];
        } else if (pendingOrderId) {
            sql = `SELECT s.id, s.title, s.trade_id, s.pending_limit_order_id, s.created_at, s.updated_at, s.agent_type,
             (SELECT COUNT(*) FROM react_chat_messages WHERE session_id = s.id) as message_count
           FROM react_chat_sessions s
           WHERE s.user_id = $1 AND s.pending_limit_order_id = $2
           ORDER BY s.updated_at DESC`;
            params = [session.userId, parseInt(pendingOrderId)];
        } else {
            sql = `SELECT s.id, s.title, s.trade_id, s.pending_limit_order_id, s.created_at, s.updated_at, s.agent_type,
             (SELECT COUNT(*) FROM react_chat_messages WHERE session_id = s.id) as message_count
           FROM react_chat_sessions s
           WHERE s.user_id = $1
           ORDER BY s.updated_at DESC
           LIMIT 50`;
            params = [session.userId];
        }

        const result = await query(sql, params);
        console.log('[SESSIONS GET] Found', result.rowCount, 'sessions');
        return NextResponse.json(result.rows);
    } catch (error: any) {
        console.error('[SESSIONS GET] ERROR:', error.message, error.stack);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Crear nueva sesión
export async function POST(req: NextRequest) {
    try {
        const session = await getAuthSession();
        console.log('[SESSIONS POST] Auth:', session ? `userId=${session.userId}` : 'NO SESSION');
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { tradeId, pendingLimitOrderId, title, agentType } = body;
        console.log('[SESSIONS POST] Creating session, tradeId:', tradeId, 'pendingLimitOrderId:', pendingLimitOrderId, 'title:', title, 'agentType:', agentType);

        // Default agentType to 'TRADER' if not provided
        const finalAgentType = agentType || 'TRADER';

        const result = await query(
            'INSERT INTO react_chat_sessions (user_id, trade_id, pending_limit_order_id, title, agent_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [session.userId, tradeId || null, pendingLimitOrderId || null, title || null, finalAgentType]
        );

        console.log('[SESSIONS POST] Created session:', result.rows[0]?.id);
        return NextResponse.json(result.rows[0], { status: 201 });
    } catch (error: any) {
        console.error('[SESSIONS POST] ERROR:', error.message, error.stack);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


// DELETE: Eliminar sesión
export async function DELETE(req: NextRequest) {
    try {
        const session = await getAuthSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('id');
        if (!sessionId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        await query(
            'DELETE FROM react_chat_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, session.userId]
        );

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[SESSIONS DELETE] ERROR:', error.message, error.stack);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
