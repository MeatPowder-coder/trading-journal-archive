"use client";

import { gql, useSubscription } from "@apollo/client";
import { buildDashboardSnapshotFromWebTrades } from "@trading-journal/journal-data";
import { JournalDashboardParity } from "@trading-journal/journal-ui";

const TRADES_PARITY_SUBSCRIPTION = gql`
  subscription DesktopParityTrades {
    trades_activos(order_by: { id: desc }, limit: 300) {
      id
      simbolo
      direccion
      precio_entrada
      estado
      order_type
      entry_order_status
    }
  }
`;

export default function DesktopParityPreviewPage() {
  const { data } = useSubscription(TRADES_PARITY_SUBSCRIPTION);
  const trades = Array.isArray(data?.trades_activos) ? data.trades_activos : [];
  const snapshot = buildDashboardSnapshotFromWebTrades(trades);

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Desktop Parity</p>
          <h1 className="text-3xl font-bold text-zinc-100">Shared Journal UI Preview</h1>
          <p className="text-zinc-400">
            This screen uses the same shared package used by the Windows app.
          </p>
        </div>
        <JournalDashboardParity snapshot={snapshot} title="Web Journal Snapshot" />
      </div>
    </main>
  );
}
