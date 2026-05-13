import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * GET /api/trades/:id — Devuelve los datos de un trade específico.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getAuthSession();
        if (!session) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const tradeId = parseInt(params.id, 10);
        if (isNaN(tradeId)) {
            return NextResponse.json({ error: 'ID de trade inválido' }, { status: 400 });
        }

        const result = await query(
            'SELECT * FROM trades_activos WHERE id = $1',
            [tradeId]
        );

        if (!result.rows.length) {
            return NextResponse.json({ error: 'Trade no encontrado' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0]);
    } catch (error: any) {
        console.error('Error fetching trade:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
