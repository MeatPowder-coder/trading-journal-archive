"use client";

import { useState, memo } from "react";
import {
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatInterface } from "@/components/ChatInterface";

interface AnalysisDrawerProps {
  trade: any;
  isOpen: boolean;
  onClose: () => void;
}

export function AnalysisDrawer({ trade, isOpen, onClose }: AnalysisDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 ease-in-out"
      >
        <ChatInterface
          mode="drawer"
          tradeId={trade?.id}
          tradeContext={trade ? {
            simbolo: trade.simbolo,
            direccion: trade.direccion,
            pnl_realizado: Number(trade.pnl_realizado || 0),
          } : undefined}
          onClose={onClose}
        />
      </div>
    </>
  );
}
