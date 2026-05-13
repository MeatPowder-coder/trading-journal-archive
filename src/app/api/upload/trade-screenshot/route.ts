import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const maxDuration = 30;

/**
 * POST /api/upload/trade-screenshot
 * Guarda una imagen base64 como screenshot de un trade.
 * Body: { tradeId: number, imageData: string (base64 o data URL), mimeType?: string }
 * Returns: { url: string }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getAuthSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { tradeId, imageData, mimeType = 'image/png' } = await req.json();

        if (!tradeId || !imageData) {
            return NextResponse.json({ error: 'Missing tradeId or imageData' }, { status: 400 });
        }

        // Extraer base64 puro del Data URL si es necesario
        let base64Data = imageData;
        if (imageData.startsWith('data:')) {
            base64Data = imageData.split(',')[1];
        }

        // Determinar extensión del archivo
        const extMap: Record<string, string> = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/webp': 'webp',
            'image/gif': 'gif',
        };
        const ext = extMap[mimeType] || 'png';

        // Crear directorio si no existe
        const uploadDir = join(process.cwd(), 'public', 'uploads', 'trades');
        await mkdir(uploadDir, { recursive: true });

        // Nombre único con timestamp
        const filename = `trade_${tradeId}_${Date.now()}.${ext}`;
        const filepath = join(uploadDir, filename);

        // Guardar archivo
        const buffer = Buffer.from(base64Data, 'base64');
        await writeFile(filepath, buffer);

        // URL relativa para acceso desde el frontend
        const url = `/uploads/trades/${filename}`;

        console.log(`[UPLOAD] Saved trade screenshot: ${filepath} -> ${url}`);

        return NextResponse.json({ url, filename });
    } catch (error: any) {
        console.error('[UPLOAD] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
