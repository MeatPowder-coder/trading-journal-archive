
import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { query } from '@/lib/db';
import { getAuthSession } from '@/lib/auth';

// Recursive function to get all files
async function getFiles(dir: string): Promise<string[]> {
    const dirents = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = join(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    }));
    return Array.prototype.concat(...files);
}

export async function GET(req: NextRequest) {
    try {
        const session = await getAuthSession();
        if (!session) { // TODO: Add admin check if needed
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const uploadsDir = join(process.cwd(), 'public', 'uploads');
        let allFiles: string[] = [];
        try {
            allFiles = await getFiles(uploadsDir);
        } catch (err) {
            console.error("Error reading uploads dir:", err);
            // Directory might not exist yet
            return NextResponse.json([]);
        }

        // 1. Get all file paths relative to public
        const filesOnDisk = await Promise.all(allFiles.map(async (f) => {
            const stats = await stat(f);
            const relativePath = f.replace(join(process.cwd(), 'public'), '');
            return {
                path: relativePath, // e.g. /uploads/image.png
                name: relativePath.split('/').pop() || '',
                size: stats.size,
                mtime: stats.mtime,
                absolutePath: f
            };
        }));

        // 2. Get DB references
        // Trades
        const tradesRes = await query('SELECT id, screenshot_url, simbolo FROM trades_activos WHERE screenshot_url IS NOT NULL');
        // Chat Messages
        // Note: react_chat_messages stores file_url. 
        // We also check for images embedded in markdown content? No, usually separate column or just file_url logic.
        // But `route.ts` logic showed inserting `file_url` column.
        const chatRes = await query('SELECT id, session_id, file_url FROM react_chat_messages WHERE file_url IS NOT NULL');

        // 3. Map references
        const usageMap = new Map<string, any>();

        tradesRes.rows.forEach((t: any) => {
            if (t.screenshot_url) {
                // Normalize DB URL (might be full URL or relative)
                // If full URL, extract path
                let path = t.screenshot_url;
                try {
                    const u = new URL(t.screenshot_url, 'http://dummy.com');
                    path = u.pathname;
                } catch { }
                usageMap.set(path, { type: 'TRADE', id: t.id, description: `Trade ${t.simbolo}` });
            }
        });

        chatRes.rows.forEach((c: any) => {
            if (c.file_url) {
                let path = c.file_url;
                try {
                    const u = new URL(c.file_url, 'http://dummy.com');
                    path = u.pathname;
                } catch { }
                // Handle duplicate references safely (prioritize existing or just overwrite)
                if (!usageMap.has(path)) {
                    usageMap.set(path, { type: 'CHAT', id: c.session_id, description: `Chat Session` });
                }
            }
        });

        // 4. Combine
        const result = filesOnDisk.map(f => {
            const linked = usageMap.get(f.path);
            return {
                ...f,
                status: linked ? 'LINKED' : 'ORPHAN',
                linkedTo: linked || null
            };
        });

        return NextResponse.json(result);

    } catch (error: any) {
        console.error("Error in /api/admin/files:", error);
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getAuthSession();
        if (!session) return new NextResponse('Unauthorized', { status: 401 });

        const searchParams = req.nextUrl.searchParams;
        const filePath = searchParams.get('path');

        if (!filePath) return new NextResponse('Missing path', { status: 400 });

        // Security check: must be in public/uploads
        if (!filePath.startsWith('/uploads/')) {
            return new NextResponse('Invalid path', { status: 400 });
        }

        const absolutePath = join(process.cwd(), 'public', filePath);

        // Verify it exists
        try {
            await stat(absolutePath);
        } catch {
            return new NextResponse('File not found', { status: 404 });
        }

        await unlink(absolutePath);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
