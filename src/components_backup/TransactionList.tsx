"use client";

import { useSubscription, gql } from "@apollo/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownLeft, Wallet, Calendar as CalendarIcon, Search, Edit } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EditTransactionModal } from "./EditTransactionModal";

const TRANSACTIONS_SUBSCRIPTION = gql`
  subscription GetTransactions {
    transacciones(order_by: {fecha_transaccion: desc}, limit: 50) {
      id
      fecha_transaccion
      descripcion
      categoria
      monto
      tipo
      moneda
      cuenta_id
    }
  }
`;

const ACCOUNTS_SUBSCRIPTION = gql`
  subscription GetAccounts {
    cuentas {
      id
      nombre
      tipo
    }
  }
`;

const getCategoryEmoji = (category: string | null) => {
    if (!category) return "📝";
    const cat = category.toLowerCase();
    if (cat.includes("comida") || cat.includes("restaurante") || cat.includes("alimentacion")) return "🍔";
    if (cat.includes("transporte") || cat.includes("uber") || cat.includes("gasolina")) return "🚗";
    if (cat.includes("vivienda") || cat.includes("arriendo")) return "🏠";
    if (cat.includes("servicios") || cat.includes("luz") || cat.includes("agua") || cat.includes("internet")) return "💡";
    if (cat.includes("entretenimiento") || cat.includes("cine") || cat.includes("netflix")) return "🎬";
    if (cat.includes("salud") || cat.includes("medico") || cat.includes("farmacia")) return "🏥";
    if (cat.includes("educacion") || cat.includes("curso") || cat.includes("universidad")) return "📚";
    if (cat.includes("mercado") || cat.includes("supermercado")) return "🛒";
    if (cat.includes("ingreso") || cat.includes("salario") || cat.includes("nomina")) return "💰";
    if (cat.includes("transferencia")) return "↔️";
    if (cat.includes("ahorro") || cat.includes("inversion")) return "🐷";
    if (cat.includes("mascota")) return "🐾";
    if (cat.includes("viaje")) return "✈️";
    if (cat.includes("ropa") || cat.includes("moda")) return "👕";
    return "📝";
};

interface Account {
    id: number;
    nombre: string;
    tipo: string;
}

export function TransactionList() {
  const { data: transData, loading: transLoading, error: transError } = useSubscription(TRANSACTIONS_SUBSCRIPTION);
  const { data: accData, loading: accLoading, error: accError } = useSubscription(ACCOUNTS_SUBSCRIPTION);
  
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTransaction, setEditingTransaction] = useState<any>(null);

  const error = transError || accError;
  const loading = transLoading || accLoading;

  if (error) {
    return (
      <Card className="w-full border-red-200 bg-red-50 dark:bg-red-900/10">
        <CardContent className="flex flex-col items-center justify-center py-10 text-red-600">
          <p className="font-semibold">Error loading transactions</p>
          <p className="text-sm mt-2">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const transactions = transData?.transacciones || [];
  const accounts: Account[] = accData?.cuentas || [];

  // Create a map for quick account lookup
  const accountMap = new Map(accounts.map((acc: Account) => [acc.id, acc]));

  const filteredTransactions = transactions.filter((t: any) => {
    const matchesSearch = t.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.categoria?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || t.categoria === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Unique categories for filter
  const categories = Array.from(new Set(transactions.map((t: any) => t.categoria).filter(Boolean))) as string[];

  const TransactionCard = ({ t }: { t: any }) => {
      const isExpense = t.tipo === 'GASTO' || t.tipo === 'EGRESO';
      const account = accountMap.get(t.cuenta_id);
      
      return (
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors relative group">
              <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                      <span className="text-xl">{getCategoryEmoji(t.categoria)}</span>
                      <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100 leading-none mb-1">{t.descripcion || 'Sin descripción'}</p>
                          <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                              <CalendarIcon className="h-2 w-2" />
                              {t.fecha_transaccion ? new Date(t.fecha_transaccion).toLocaleDateString() : '---'}
                          </p>
                      </div>
                  </div>
                  <div className="flex flex-col items-end">
                      <div className={`font-bold flex items-center gap-1 ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                          {isExpense ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                          <span className="text-[10px] opacity-70 font-medium">{t.moneda}</span>
                          ${Math.abs(Number(t.monto)).toLocaleString()}
                      </div>
                      <Badge variant="outline" className="text-[9px] mt-1 px-1 py-0 h-4">{account?.nombre || '---'}</Badge>
                  </div>
              </div>
              <button 
                  onClick={() => setEditingTransaction(t)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-zinc-400 hover:text-indigo-500"
              >
                  <Edit className="h-3 w-3" />
              </button>
          </div>
      );
  };

  return (
    <Card className="w-full shadow-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <CardHeader>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6 text-purple-500" />
                Historial de Transacciones
                </CardTitle>
                <CardDescription>Movimientos recientes en tus cuentas</CardDescription>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input 
                        placeholder="Buscar..." 
                        className="pl-8" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                                {getCategoryEmoji(cat)} {cat}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 md:p-6">
        {/* Mobile View: Cards */}
        <div className="md:hidden">
            {loading && transactions.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="p-4 border-b border-zinc-100 dark:border-zinc-800">
                        <Skeleton className="h-4 w-[150px] mb-2" />
                        <Skeleton className="h-3 w-[100px]" />
                    </div>
                ))
            ) : filteredTransactions.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">No se encontraron transacciones.</div>
            ) : (
                filteredTransactions.map((t: any) => <TransactionCard key={t.id} t={t} />)
            )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead className="w-[120px]">Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="w-[50px]"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading && transactions.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-[200px]" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                        <TableCell></TableCell>
                    </TableRow>
                ))
                ) : filteredTransactions.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-zinc-500">
                            No se encontraron transacciones.
                        </TableCell>
                    </TableRow>
                ) : (
                    filteredTransactions.map((t: any) => {
                    const isIncome = t.tipo === 'INGRESO' || t.monto > 0 && t.tipo !== 'GASTO'; 
                    const isExpense = t.tipo === 'GASTO' || t.tipo === 'EGRESO';
                    const account = accountMap.get(t.cuenta_id);
                    
                    return (
                    <TableRow key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 group">
                        <TableCell className="font-mono text-zinc-600 dark:text-zinc-400">
                            <div className="flex items-center gap-2 text-xs">
                                <CalendarIcon className="h-3 w-3" />
                                {t.fecha_transaccion ? new Date(t.fecha_transaccion).toLocaleDateString() : '---'}
                            </div>
                        </TableCell>
                        <TableCell className="font-medium text-zinc-700 dark:text-zinc-200">
                            {t.descripcion || 'Sin descripción'}
                        </TableCell>
                        <TableCell>
                            <Badge variant="outline" className="bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-normal">
                                <span className="mr-2 text-lg">{getCategoryEmoji(t.categoria)}</span>
                                {t.categoria || 'General'}
                            </Badge>
                        </TableCell>
                        <TableCell>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">{account?.nombre || '---'}</span>
                                <span className="text-[10px] text-zinc-500">{account?.tipo}</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-right">
                            <div className={`font-bold flex items-center justify-end gap-1 ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                                {isExpense ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                                <span className="text-[10px] mr-1 text-zinc-500 font-medium uppercase">{t.moneda}</span>
                                ${Math.abs(Number(t.monto)).toLocaleString()}
                            </div>
                        </TableCell>
                        <TableCell>
                             <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 opacity-0 group-hover:opacity-100" 
                                onClick={() => setEditingTransaction(t)}
                            >
                                <Edit className="h-4 w-4 text-zinc-400" />
                            </Button>
                        </TableCell>
                    </TableRow>
                    );
                    })
                )}
            </TableBody>
            </Table>
        </div>
      </CardContent>

      {editingTransaction && (
          <EditTransactionModal 
            transaction={editingTransaction} 
            open={!!editingTransaction} 
            onOpenChange={(open) => !open && setEditingTransaction(null)}
            accounts={accounts}
          />
      )}
    </Card>
  );
}
