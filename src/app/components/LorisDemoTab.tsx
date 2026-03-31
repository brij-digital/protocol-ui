type LorisDemoTabProps = {
  onOpenRunner: () => void;
};

const DEMO_ASSETS = [
  {
    label: 'Codama IDL',
    href: '/idl/orca_whirlpool.codama.json',
    note: 'Instruction truth: accounts, defaults, PDA metadata.',
  },
  {
    label: 'Indexing Spec',
    href: '/idl/orca_whirlpool.indexing.json',
    note: 'Indexed reads, projections, and canonical search/feed semantics.',
  },
  {
    label: 'Runtime Spec',
    href: '/idl/orca_whirlpool.runtime.json',
    note: 'Compute and contract-write capabilities only.',
  },
  {
    label: 'Runner Spec',
    href: '/idl/draft_swap_orca.runner.json',
    note: 'Linear composition: token resolve -> quote -> draft.',
  },
];

const BOUNDARY_ROWS = [
  {
    layer: 'Codama',
    role: 'Instruction-level source of truth',
    examples: 'accounts, signers, PDA/default accounts',
  },
  {
    layer: 'Indexing spec',
    role: 'Off-chain read/discovery contract',
    examples: 'pool search, feeds, market series',
  },
  {
    layer: 'Runtime spec',
    role: 'Deterministic compute + write prep',
    examples: 'quote math, draft construction',
  },
  {
    layer: 'Runner',
    role: 'Tiny linear orchestration',
    examples: 'index_view -> compute -> contract_write',
  },
];

export function LorisDemoTab({ onOpenRunner }: LorisDemoTabProps) {
  return (
    <section className="loris-demo-shell">
      <div className="loris-hero">
        <div>
          <p className="loris-eyebrow">Codama Boundary Demo</p>
          <h2>Loris demo: what Codama already replaces, and what remains outside</h2>
          <p>
            This page shows the exact split we ended up with after simplifying the runtime hard.
            Codama now carries instruction execution truth; indexing owns read semantics; runtime
            is reduced to compute + write; the runner only composes steps linearly.
          </p>
        </div>
        <div className="loris-actions">
          <button type="button" onClick={onOpenRunner}>
            Open live runner flow
          </button>
          <a href="/idl/action_runners.json" target="_blank" rel="noreferrer">
            Open runner registry
          </a>
        </div>
      </div>

      <div className="loris-grid">
        <article className="loris-card">
          <h3>Live flow</h3>
          <ol className="loris-step-list">
            <li>
              Resolve pair inputs like <code>USDC -&gt; SOL</code> from indexed token/pool data.
            </li>
            <li>Run a deterministic quote compute.</li>
            <li>Draft the Orca swap from Codama-backed instruction metadata.</li>
            <li>Optionally submit in wallet from the Runner tab.</li>
          </ol>
          <p className="loris-muted">
            Recommended live demo: <code>Draft Swap on Orca</code> in the Runner tab.
          </p>
        </article>

        <article className="loris-card">
          <h3>Boundary</h3>
          <div className="loris-boundary-table">
            {BOUNDARY_ROWS.map((row) => (
              <div key={row.layer} className="loris-boundary-row">
                <strong>{row.layer}</strong>
                <span>{row.role}</span>
                <code>{row.examples}</code>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="loris-card">
        <h3>Specs to inspect</h3>
        <div className="loris-spec-list">
          {DEMO_ASSETS.map((asset) => (
            <a key={asset.href} className="loris-spec-link" href={asset.href} target="_blank" rel="noreferrer">
              <strong>{asset.label}</strong>
              <span>{asset.href}</span>
              <p>{asset.note}</p>
            </a>
          ))}
        </div>
      </article>

      <article className="loris-card loris-card-accent">
        <h3>Why this matters</h3>
        <p>
          The interesting leftover after pushing work into Codama is not account resolution anymore.
          It is mostly transaction-envelope logic and any flow that needs a fresh read between
          steps. That is why Codama instruction plans look like the next natural place to reduce
          custom runtime surface.
        </p>
      </article>
    </section>
  );
}
