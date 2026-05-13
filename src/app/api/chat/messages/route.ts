import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query } from '@/lib/db';

// GET: Cargar mensajes de una sesión
export async function GET(req: NextRequest) {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

    // Verificar que la sesión pertenece al usuario
    const sessionCheck = await query(
        'SELECT id FROM react_chat_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, session.userId]
    );
    if (sessionCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const result = await query(
        `SELECT id, role, content, file_url, file_type, created_at 
     FROM react_chat_messages 
     WHERE session_id = $1 
     ORDER BY created_at ASC`,
        [sessionId]
    );

    console.log(`[MESSAGES GET] sessionId=${sessionId} found=${result.rows.length} messages`);

    return NextResponse.json(result.rows);
}
