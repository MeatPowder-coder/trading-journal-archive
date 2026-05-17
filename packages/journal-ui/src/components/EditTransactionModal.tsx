
import { useState, useEffect } from "react";
import { useMutation, gql } from "@apollo/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const UPDATE_TRANSACTION = gql`
  mutation UpdateTransaction(
    $id: Int!
    $descripcion: String
    $monto: numeric
    $categoria: String
    $tipo: String
    $moneda: String
    $fecha_transaccion: timestamptz
    $cuenta_id: Int
  ) {
    update_transacciones_by_pk(
      pk_columns: { id: $id }
      _set: {
        descripcion: $descripcion
        monto: $monto
        categoria: $categoria
        tipo: $tipo
        moneda: $moneda
        fecha_transaccion: $fecha_transaccion
        cuenta_id: $cuenta_id
      }
    ) {
      id
    }
  }
`;

interface Transaction {
  id: number;
  descripcion: string;
  monto: number;
  categoria: string;
  tipo: string;
  moneda: string;
  fecha_transaccion: string;
  cuenta_id: number;
}

interface EditTransactionModalProps {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: { id: number; nombre: string }[];
}

export function EditTransactionModal({ transaction, open, onOpenChange, accounts }: EditTransactionModalProps) {
  const [formData, setFormData] = useState({
    descripcion: transaction.descripcion || "",
    monto: transaction.monto.toString(),
    categoria: transaction.categoria || "",
    tipo: transaction.tipo || "GASTO",
    moneda: transaction.moneda || "COP",
    fecha_transaccion: new Date(transaction.fecha_transaccion).toISOString().slice(0, 16),
    cuenta_id: transaction.cuenta_id.toString(),
  });

  const [updateTransaction, { loading }] = useMutation(UPDATE_TRANSACTION, {
    onCompleted: () => onOpenChange(false),
    onError: (err) => alert("Error: " + err.message),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateTransaction({
      variables: {
        id: transaction.id,
        descripcion: formData.descripcion,
        monto: parseFloat(formData.monto),
        categoria: formData.categoria,
        tipo: formData.tipo,
        moneda: formData.moneda,
        fecha_transaccion: new Date(formData.fecha_transaccion).toISOString(),
        cuenta_id: parseInt(formData.cuenta_id),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Transacción</DialogTitle>
          <DialogDescription>Modifica los detalles de la transacción.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="desc">Descripción</Label>
            <Input 
                id="desc" 
                value={formData.descripcion} 
                onChange={(e) => setFormData({...formData, descripcion: e.target.value})} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="monto">Monto</Label>
                <Input 
                    id="monto" 
                    type="number" 
                    step="0.01"
                    value={formData.monto} 
                    onChange={(e) => setFormData({...formData, monto: e.target.value})} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="moneda">Moneda</Label>
                <Input 
                    id="moneda" 
                    value={formData.moneda} 
                    onChange={(e) => setFormData({...formData, moneda: e.target.value})} 
                />
              </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={formData.tipo} onValueChange={(v) => setFormData({...formData, tipo: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="INGRESO">Ingreso</SelectItem>
                        <SelectItem value="GASTO">Gasto</SelectItem>
                        <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Cuenta</Label>
                <Select value={formData.cuenta_id} onValueChange={(v) => setFormData({...formData, cuenta_id: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {accounts.map(acc => (
                            <SelectItem key={acc.id} value={acc.id.toString()}>{acc.nombre}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
          </div>
          <div className="grid gap-2">
            <Label>Fecha</Label>
            <Input 
                type="datetime-local" 
                value={formData.fecha_transaccion} 
                onChange={(e) => setFormData({...formData, fecha_transaccion: e.target.value})} 
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
