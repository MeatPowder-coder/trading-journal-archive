
import { useQuery, useMutation, useSubscription, gql } from "@apollo/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const GET_DATA = gql`
  query GetData {
    cuentas(order_by: {id: asc}) {
      id
      nombre
      moneda
      saldo_actual
      tipo
      cupo_maximo
      deuda_calculada
    }
  }
`;

const BALANCE_VIEWS_SUBSCRIPTION = gql`
  subscription GetBalanceViews {
    balance_views(order_by: {id: asc}) {
      id
      nombre
      config
    }
  }
`;

const INSERT_BALANCE_VIEW = gql`
  mutation InsertBalanceView($nombre: String!, $config: jsonb!) {
    insert_balance_views_one(object: {nombre: $nombre, config: $config}) {
      id
    }
  }
`;

const DELETE_BALANCE_VIEW = gql`
  mutation DeleteBalanceView($id: Int!) {
    delete_balance_views_by_pk(id: $id) {
      id
    }
  }
`;

const UPDATE_ACCOUNT_BALANCE = gql`
  mutation UpdateAccountBalance($id: Int!, $saldo: numeric!) {
    update_cuentas_by_pk(pk_columns: {id: $id}, _set: {saldo_actual: $saldo}) {
      id
      saldo_actual
    }
  }
`;

interface Account {
  id: number;
  nombre: string;
  moneda: string;
  saldo_actual: number;
  tipo: string;
  cupo_maximo: number;
  deuda_calculada: number;
}

interface BalanceView {
  id: number;
  nombre: string;
  config: {
    accountIds: number[];
    targetCurrency: string;
  };
}

interface AccountBalanceProps {
  trades: any[];
  prices: Record<string, number>;
  calculateRealTimePnL: (trade: any) => number;
}

export function AccountBalance({ trades, prices, calculateRealTimePnL }: AccountBalanceProps) {
  const { data: accData, loading: accLoading, error: accError } = useQuery(GET_DATA, {
    pollInterval: 10000,
  });
  
  const { data: viewData, loading: viewLoading } = useSubscription(BALANCE_VIEWS_SUBSCRIPTION);
  const [insertView] = useMutation(INSERT_BALANCE_VIEW, {
      onCompleted: () => console.log("View saved successfully"),
      onError: (err) => {
          console.error("Error saving view:", err);
          alert("Error al guardar: " + err.message);
      }
  });
  const [deleteView] = useMutation(DELETE_BALANCE_VIEW);
  const [updateAccount] = useMutation(UPDATE_ACCOUNT_BALANCE);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [targetCurrency, setTargetCurrency] = useState("COP");

  if (accLoading) {
    return (
        <Card className="w-full shadow-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 mb-6">
            <CardHeader className="pb-2">
                <Skeleton className="h-6 w-[150px]" />
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                </div>
                <Skeleton className="h-64 w-full" />
            </CardContent>
        </Card>
    );
  }

  if (accError) {
    console.error("Error loading data:", accError);
    return null;
  }

  const accounts: Account[] = accData?.cuentas || [];
  const balanceViews: BalanceView[] = viewData?.balance_views || [];

  // Calcular saldos ajustados con Holdings
  const adjustedAccounts = accounts.map(acc => {
    const accountTrades = trades.filter(t => 
        Number(t.cuenta_id) === acc.id && 
        t.tipo_estrategia === 'HOLDING' && 
        (t.estado === 'OPEN' || t.estado === 'ABIERTO')
    );
    
    const unrealizedPnL = accountTrades.reduce((sum, t) => sum + calculateRealTimePnL(t), 0);
    const adjustedBalance = Number(acc.saldo_actual) + unrealizedPnL;
    
    return {
        ...acc,
        unrealizedPnL,
        adjustedBalance
    };
  });

  const handleCreateView = async () => {
      if (!newViewName || selectedAccountIds.length === 0) return;
      
      await insertView({
          variables: {
              nombre: newViewName,
              config: {
                  accountIds: selectedAccountIds,
                  targetCurrency
              }
          }
      });
      
      setIsCreateOpen(false);
      setNewViewName("");
      setSelectedAccountIds([]);
  };

  const handleDeleteView = async (id: number) => {
      await deleteView({ variables: { id } });
  };

  const toggleAccountSelection = (id: number) => {
      setSelectedAccountIds(prev => 
          prev.includes(id) ? prev.filter(aid => aid !== id) : [...prev, id]
      );
  };

  const handleEditBalance = async (account: Account) => {
      const newBalance = prompt(`Actualizar saldo base para ${account.nombre} (${account.moneda})`, account.saldo_actual.toString());
      if (newBalance === null) return;
      
      const val = parseFloat(newBalance);
      if (isNaN(val)) {
          alert("Valor inválido");
          return;
      }

      await updateAccount({
          variables: {
              id: account.id,
              saldo: val
          }
      });
  };

  // Lógica de conversión (Simplificada para demostración, idealmente usar USDCOP=X de prices)
  const usdToCopRate = prices['USDCOP=X'] || 4000;

  const calculateGroupTotal = (view: BalanceView) => {
      let total = 0;
      view.config.accountIds.forEach(id => {
          const acc = adjustedAccounts.find(a => a.id === id);
          if (!acc) return;
          
          let balanceInTarget = 0;
          const currentBalance = acc.tipo === 'CREDITO' || acc.tipo === 'TARJETA_CREDITO' 
            ? -Number(acc.deuda_calculada) 
            : acc.adjustedBalance;

          if (acc.moneda === view.config.targetCurrency) {
              balanceInTarget = currentBalance;
          } else if (acc.moneda === 'USD' && view.config.targetCurrency === 'COP') {
              balanceInTarget = currentBalance * usdToCopRate;
          } else if (acc.moneda === 'COP' && view.config.targetCurrency === 'USD') {
              balanceInTarget = currentBalance / usdToCopRate;
          } else {
              balanceInTarget = currentBalance; // Fallback
          }
          total += balanceInTarget;
      });
      return total;
  };

  return (
    <div className="space-y-6">
      {/* Súper Saldos / Vistas Personalizadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {balanceViews.map((view) => (
              <Card key={view.id} className="border-2 border-indigo-500/20 bg-indigo-50/10 dark:bg-indigo-900/5 relative group overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDeleteView(view.id)}>
                          <Trash2 className="h-4 w-4" />
                      </Button>
                  </div>
                  <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                          {view.nombre}
                      </CardTitle>
                  </CardHeader>
                  <CardContent>
                      <div className="text-3xl font-black text-zinc-900 dark:text-zinc-50">
                          {view.config.targetCurrency === 'USD' ? '$' : 'COP '}
                          {calculateGroupTotal(view).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                          {view.config.accountIds.map(aid => {
                              const acc = accounts.find(a => a.id === aid);
                              return acc ? (
                                  <Badge key={aid} variant="secondary" className="text-[9px] px-1 py-0 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-none">
                                      {acc.nombre}
                                  </Badge>
                              ) : null;
                          })}
                      </div>
                  </CardContent>
              </Card>
          ))}

          {/* Botón Crear Nueva Vista */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                  <Button variant="outline" className="h-full min-h-[140px] border-dashed border-2 flex flex-col gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <Plus className="h-6 w-6 text-zinc-400" />
                      <span className="text-zinc-500">Crear Súper Saldo</span>
                  </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                      <DialogTitle>Nueva Vista de Saldo</DialogTitle>
                      <DialogDescription>
                          Crea un saldo combinado seleccionando múltiples cuentas.
                      </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                          <Label htmlFor="name">Nombre del Súper Saldo</Label>
                          <Input id="name" placeholder="Ej: Mi Patrimonio" value={newViewName} onChange={(e) => setNewViewName(e.target.value)} />
                      </div>
                      <div className="grid gap-2">
                          <Label>Seleccionar Cuentas</Label>
                          <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto p-2 border rounded-md">
                              {accounts.map(acc => (
                                  <div key={acc.id} className="flex items-center space-x-2 p-1 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded">
                                      <input 
                                          type="checkbox"
                                          id={`acc-${acc.id}`} 
                                          checked={selectedAccountIds.includes(acc.id)}
                                          onChange={() => toggleAccountSelection(acc.id)}
                                          className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <label htmlFor={`acc-${acc.id}`} className="text-sm font-medium leading-none cursor-pointer flex-1">
                                          {acc.nombre} ({acc.moneda})
                                      </label>
                                  </div>
                              ))}
                          </div>
                      </div>
                      <div className="grid gap-2">
                          <Label>Moneda de Visualización</Label>
                          <Select value={targetCurrency} onValueChange={setTargetCurrency}>
                              <SelectTrigger>
                                  <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="COP">COP (Peso Colombiano)</SelectItem>
                                  <SelectItem value="USD">USD (Dólar)</SelectItem>
                              </SelectContent>
                          </Select>
                      </div>
                  </div>
                  <DialogFooter>
                      <Button onClick={handleCreateView} disabled={!newViewName || selectedAccountIds.length === 0}>
                          Guardar Configuración
                      </Button>
                  </DialogFooter>
              </DialogContent>
          </Dialog>
      </div>

      <Card className="w-full shadow-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-indigo-500" />
            Saldos de Cuentas Individuales
          </CardTitle>
          <CardDescription>
              Incluye el PnL en tiempo real de tus Holdings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {adjustedAccounts.map((account) => (
              <div key={account.id} className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 relative group">
                <button 
                    onClick={() => handleEditBalance(account)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-indigo-500"
                >
                    <Plus className="h-3 w-3" />
                </button>
                <div className="flex justify-between items-start">
                    <div className="text-sm text-zinc-500 font-medium truncate max-w-[150px]" title={account.nombre}>
                        {account.nombre}
                    </div>
                    <Badge variant="outline" className="text-[9px] uppercase">{account.tipo.replace('_', ' ')}</Badge>
                </div>
                <div className="text-2xl font-bold mt-1 text-zinc-800 dark:text-zinc-100">
                  <span className="text-xs mr-1 opacity-50 font-normal">{account.moneda === "COP" ? "COP" : "$"}</span>
                  {Number(account.adjustedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                
                {/* Detalles de Deuda o PnL */}
                {(account.tipo === 'CREDITO' || account.tipo === 'TARJETA_CREDITO') ? (
                    <div className="mt-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                        <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-wider">
                            <span>Deuda</span>
                            <span className="text-red-500">-${Number(account.deuda_calculada).toLocaleString()}</span>
                        </div>
                    </div>
                ) : account.unrealizedPnL !== 0 ? (
                    <div className="mt-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                        <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                            <span>Holding PnL</span>
                            <span className={account.unrealizedPnL > 0 ? "text-green-600" : "text-red-600"}>
                                {account.unrealizedPnL > 0 ? "+" : ""}{account.unrealizedPnL.toFixed(2)}
                            </span>
                        </div>
                    </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
