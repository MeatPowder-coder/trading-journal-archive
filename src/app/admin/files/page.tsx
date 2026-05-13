
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Trash2, RefreshCw, Eye, FileIcon, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface FileItem {
    path: string;
    name: string;
    size: number;
    mtime: string;
    status: 'LINKED' | 'ORPHAN';
    linkedTo: {
        type: string;
        id: any;
        description: string;
    } | null;
}

export default function FileManagerPage() {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'LINKED' | 'ORPHAN'>('ALL');

    const loadFiles = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/files');
            if (res.ok) {
                const data = await res.json();
                setFiles(data);
            }
        } catch (error) {
            console.error("Failed to load files", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFiles();
    }, []);

    const handleDelete = async (path: string) => {
        if (!confirm("¿Estás seguro de que quieres eliminar este archivo permanentemente?")) return;

        try {
            const res = await fetch(`/api/admin/files?path=${encodeURIComponent(path)}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                // Optimistic update
                setFiles(prev => prev.filter(f => f.path !== path));
            } else {
                alert("Error al eliminar");
            }
        } catch (error) {
            alert("Error al eliminar");
        }
    };

    const handleBulkDeleteOrphans = async () => {
        const orphans = files.filter(f => f.status === 'ORPHAN');
        if (orphans.length === 0) return;

        if (!confirm(`¿Estás seguro de eliminar ${orphans.length} archivos huérfanos? Esta acción no se puede deshacer.`)) return;

        // Delete sequentially to avoid overwhelmed server/browser (simple approach) or parallel
        let deletedCount = 0;
        for (const file of orphans) {
            try {
                await fetch(`/api/admin/files?path=${encodeURIComponent(file.path)}`, { method: 'DELETE' });
                deletedCount++;
            } catch (e) {
                console.error(e);
            }
        }

        loadFiles(); // Reload to be safe
        alert(`Eliminados ${deletedCount} archivos.`);
    };

    const filteredFiles = files.filter(f => {
        if (filter === 'ALL') return true;
        return f.status === filter;
    });

    const orphansCount = files.filter(f => f.status === 'ORPHAN').length;
    const totalSize = files.reduce((acc, curr) => acc + curr.size, 0);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Administrador de Archivos</h1>
                <p className="text-zinc-500">Gestor de almacenamiento de la VM. Elimina archivos huérfanos con seguridad.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Archivos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{files.length}</div>
                        <p className="text-xs text-muted-foreground">{formatSize(totalSize)} usados</p>
                    </CardContent>
                </Card>
                <Card className={orphansCount > 0 ? "border-orange-500/50 bg-orange-50/10" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Archivos Huérfanos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{orphansCount}</div>
                        <p className="text-xs text-muted-foreground">Sin uso detectado en DB</p>
                    </CardContent>
                </Card>
                <div className="flex items-center justify-end">
                    <Button
                        variant="destructive"
                        onClick={handleBulkDeleteOrphans}
                        disabled={orphansCount === 0 || loading}
                        className="w-full h-full text-lg shadow-lg"
                    >
                        <Trash2 className="mr-2 h-6 w-6" />
                        Limpiar {orphansCount} Huérfanos
                    </Button>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <Button variant={filter === 'ALL' ? 'default' : 'outline'} onClick={() => setFilter('ALL')}>
                        Todos ({files.length})
                    </Button>
                    <Button variant={filter === 'LINKED' ? 'default' : 'outline'} onClick={() => setFilter('LINKED')} className="text-green-600 border-green-200 hover:bg-green-50">
                        Vinculados ({files.filter(f => f.status === 'LINKED').length})
                    </Button>
                    <Button variant={filter === 'ORPHAN' ? 'default' : 'outline'} onClick={() => setFilter('ORPHAN')} className="text-orange-600 border-orange-200 hover:bg-orange-50">
                        Huérfanos ({orphansCount})
                    </Button>
                </div>
                <Button variant="ghost" size="icon" onClick={loadFiles} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <div className="border rounded-md bg-white dark:bg-zinc-950 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Vista</TableHead>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Vinculado A</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-right">Tamaño</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">Cargando archivos...</TableCell>
                            </TableRow>
                        ) : filteredFiles.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">No hay archivos para mostrar.</TableCell>
                            </TableRow>
                        ) : (
                            filteredFiles.map((file) => (
                                <TableRow key={file.path}>
                                    <TableCell>
                                        <div className="h-12 w-12 rounded overflow-hidden bg-zinc-100 flex items-center justify-center border">
                                            {file.path.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                                <img src={file.path} alt={file.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <FileIcon className="h-6 w-6 text-zinc-400" />
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium text-xs break-all max-w-[200px]">
                                        <a href={file.path} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                            {file.name}
                                        </a>
                                    </TableCell>
                                    <TableCell>
                                        {file.status === 'LINKED' ? (
                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                                                <CheckCircle className="h-3 w-3" /> Vinculado
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1">
                                                <AlertTriangle className="h-3 w-3" /> Huérfano
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {file.linkedTo ? (
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold">{file.linkedTo.type}</span>
                                                <span className="text-[10px] text-zinc-500">{file.linkedTo.description}</span>
                                            </div>
                                        ) : (
                                            <span className="text-zinc-400 text-xs">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-zinc-500">
                                        {formatDistanceToNow(new Date(file.mtime), { addSuffix: true, locale: es })}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-zinc-600 font-mono">
                                        {formatSize(file.size)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleDelete(file.path)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
