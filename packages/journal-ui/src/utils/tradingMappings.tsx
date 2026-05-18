import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle, 
  Shield, 
  CheckCircle, 
  XCircle, 
  BarChart2, 
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertCircle
} from "lucide-react";
import React, { ReactNode } from "react";

export interface ConfigResult {
    label: string;
    icon: ReactNode;
    color: string;
    bg?: string;
    badgeColor?: string;
}

export const getMarketContextConfig = (value: string | null): ConfigResult => {
  switch (value) {
    case 'TENDENCIA_ALCISTA':
      return { label: 'Tendencia Alcista', icon: <TrendingUp className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
    case 'TENDENCIA_BAJISTA':
      return { label: 'Tendencia Bajista', icon: <TrendingDown className="h-4 w-4" />, color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
    case 'RANGO':
      return { label: 'Rango / Lateral', icon: <Activity className="h-4 w-4" />, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' };
    default:
      return { label: value || 'No registrado', icon: <Minus className="h-4 w-4" />, color: 'text-zinc-500', bg: 'bg-zinc-100 border-zinc-200' };
  }
};

export const getLiquidityConfig = (value: string | null): ConfigResult => {
    switch (value) {
        case 'SWEEP_HIGHS':
            return { label: 'Barrido de Altos', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
        case 'SWEEP_LOWS':
            return { label: 'Barrido de Bajos', icon: <ArrowDownRight className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
        case 'INTERNAL':
            return { label: 'Liquidez Interna', icon: <Activity className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' };
         case 'EXTERNAL':
            return { label: 'Liquidez Externa', icon: <Activity className="h-4 w-4" />, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' };
        default:
            return { label: value || 'No registrado', icon: <Minus className="h-4 w-4" />, color: 'text-zinc-500', bg: 'bg-zinc-100 border-zinc-200' };
    }
};

export const getVolumeConfig = (value: string | null): ConfigResult => {
    switch (value) {
        case 'MUCHO_VOLUMEN':
            return { label: 'Volumen Alto', icon: <BarChart2 className="h-4 w-4" />, color: 'text-purple-600' };
        case 'BAJO':
            return { label: 'Volumen Bajo', icon: <BarChart2 className="h-4 w-4 opacity-50" />, color: 'text-zinc-400' };
        case 'CLIMAX':
            return { label: 'Clímax de Volumen', icon: <BarChart2 className="h-4 w-4" />, color: 'text-orange-600' };
        default:
             return { label: value ? `Volumen: ${value}` : 'No registrado', icon: <BarChart2 className="h-4 w-4" />, color: 'text-zinc-500' };
    }
}

export const getDeltaConfig = (value: string | null): ConfigResult => {
    switch (value) {
        case 'DIVERGENTE':
            return { label: 'Delta Divergente', icon: <TrendingDown className="h-4 w-4" />, color: 'text-purple-600' }; // User requested Purple
        case 'A_FAVOR':
        case 'POSITIVO':
            return { label: 'Delta a Favor', icon: <TrendingUp className="h-4 w-4" />, color: 'text-green-600' };
        case 'EN_CONTRA':
        case 'NEGATIVO':
            return { label: 'Delta en Contra', icon: <TrendingDown className="h-4 w-4" />, color: 'text-red-600' };
        default:
            return { label: 'Delta Neutro', icon: <Minus className="h-4 w-4" />, color: 'text-zinc-400' };
    }
}

export const getPsychologyConfig = (value: string | null): ConfigResult => {
    switch (value) {
        case 'SEGUI_REGLAS':
            return { label: 'Seguí Reglas', icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600', badgeColor: 'bg-green-100 text-green-800 border-green-200' };
        case 'ROMPI_REGLAS':
            return { label: 'Rompí Reglas', icon: <AlertCircle className="h-4 w-4" />, color: 'text-red-600', badgeColor: 'bg-red-100 text-red-800 border-red-200' };
        default:
            return { label: 'Sin calificar', icon: <Minus className="h-4 w-4" />, color: 'text-zinc-400', badgeColor: 'bg-zinc-100 text-zinc-500 border-zinc-200' };
    }
}

export const getAbsorptionConfig = (value: boolean | null): ConfigResult => {
    if (value) {
        return { label: 'Absorción Detectada', icon: <Shield className="h-4 w-4" />, color: 'text-blue-500' }; // "Azul Brillante"
    }
    return { label: 'No detectada', icon: <Shield className="h-4 w-4 opacity-30" />, color: 'text-zinc-400' };
}

export const getVolatilityConfig = (value: string | null): ConfigResult => {
    switch (value) {
        case 'ALTA':
        case 'HIGH':
            return { label: 'Volatilidad Alta', icon: <Activity className="h-4 w-4" />, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' };
        case 'BAJA':
        case 'LOW':
            return { label: 'Volatilidad Baja', icon: <Minus className="h-4 w-4" />, color: 'text-zinc-500', bg: 'bg-zinc-100 border-zinc-200' };
        case 'NORMAL':
            return { label: 'Volatilidad Normal', icon: <Activity className="h-4 w-4" />, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-200' };
        default:
            return { label: value || 'No registrada', icon: <Minus className="h-4 w-4" />, color: 'text-zinc-400', bg: 'bg-zinc-50 border-zinc-200' };
    }
}
