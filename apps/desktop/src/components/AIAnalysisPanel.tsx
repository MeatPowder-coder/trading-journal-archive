import { useState } from 'react';

export function AIAnalysisPanel({ onRequestAnalysis, disabled }: {
  onRequestAnalysis: (prompt: string) => Promise<void>;
  disabled: boolean;
}) {
  const [prompt, setPrompt] = useState('Analyze this active trade using chart snapshot, CVD, footprint, liquidations, and SL/TP history.');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onRequestAnalysis(prompt);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="side-card ai-panel">
      <div className="card-title-row">
        <h3>AI Analysis</h3>
        <span className="tag tag-blue">Claude-ready</span>
      </div>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <button className="btn full" disabled={disabled || busy} onClick={submit}>
        {busy ? 'Requesting...' : 'Request Analysis'}
      </button>
      <p className="muted">Creates a pending backend AIAnalysis record; Claude execution is server-side.</p>
    </section>
  );
}
