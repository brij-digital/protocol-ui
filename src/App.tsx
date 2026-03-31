import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import './App.css';
import { PumpWorkspaceTab } from './app/components/PumpWorkspaceTab';
import { ComputeDevTab } from './app/components/ComputeDevTab';
import { RawOperationsTab } from './app/components/RawOperationsTab';
import { TradingViewTestTab } from './app/components/TradingViewTestTab';
import { ViewPlaygroundTab } from './app/components/ViewPlaygroundTab';
import { AgentTab } from './app/components/AgentTab';
import { RunnerTab } from './app/components/RunnerTab';

const VIEW_API_BASE_URL = '';
const RUNNER_VIEW_API_BASE_URL = '';

type AppTab = 'indexViews' | 'pump' | 'raw' | 'compute' | 'tv' | 'agent' | 'runner';
const DISABLED_TABS = ['Apps', 'Command', 'Explorer'] as const;

const TAB_HASHES: Record<AppTab, string> = {
  agent: 'agent',
  pump: 'pump',
  runner: 'runner',
  indexViews: 'index-views',
  raw: 'raw',
  compute: 'compute',
  tv: 'tradingview',
};

function parseTabFromLocationHash(): AppTab {
  if (typeof window === 'undefined') {
    return 'agent';
  }
  const hash = window.location.hash.replace(/^#/, '').trim();
  const match = (Object.entries(TAB_HASHES) as Array<[AppTab, string]>).find(([, value]) => value === hash);
  return match?.[0] ?? 'agent';
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(parseTabFromLocationHash);

  const switchTab = (nextTab: AppTab) => {
    setActiveTab(nextTab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${TAB_HASHES[nextTab]}`);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const onHashChange = () => {
      setActiveTab(parseTabFromLocationHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <main className="page-shell">
      <section className="card-shell">
        <header className="card-header">
          <div>
            <h1>AppPack — AI Compatible by Design</h1>
            <p>Define once, execute everywhere: AppPack turns protocol specs into deterministic, verifiable on-chain read and transaction flows, so users and AI agents can discover options, simulate outcomes, and execute safely without external SDK lock-in, custom API glue, or fragile wallet-connection UX.</p>
          </div>
          <WalletMultiButton />
        </header>

        <div className="tab-switcher" role="tablist" aria-label="Mode">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'agent'}
            className={activeTab === 'agent' ? 'active' : ''}
            onClick={() => switchTab('agent')}
          >
            Agent
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pump'}
            className={activeTab === 'pump' ? 'active' : ''}
            onClick={() => switchTab('pump')}
          >
            Pump
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'runner'}
            className={activeTab === 'runner' ? 'active' : ''}
            onClick={() => switchTab('runner')}
          >
            Runner
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'indexViews'}
            className={activeTab === 'indexViews' ? 'active' : ''}
            onClick={() => switchTab('indexViews')}
          >
            Index Views
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'raw'}
            className={activeTab === 'raw' ? 'active' : ''}
            onClick={() => switchTab('raw')}
          >
            Raw Ops
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'compute'}
            className={activeTab === 'compute' ? 'active' : ''}
            onClick={() => switchTab('compute')}
          >
            Compute
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tv'}
            className={activeTab === 'tv' ? 'active' : ''}
            onClick={() => switchTab('tv')}
          >
            TradingView
          </button>
          {DISABLED_TABS.map((label) => (
            <button
              key={label}
              type="button"
              role="tab"
              className="disabled-tab"
              aria-disabled="true"
              disabled
              title={`${label} is disabled. The active contract is Codama + runtime only.`}
            >
              {label}
              <span>off</span>
            </button>
          ))}
        </div>
        <p className="tab-status-note">Active path is `Codama + runtime`. App packs are out of the contract.</p>

        {activeTab === 'pump' ? (
          <PumpWorkspaceTab viewApiBaseUrl={VIEW_API_BASE_URL} />
        ) : activeTab === 'raw' ? (
          <RawOperationsTab viewApiBaseUrl={VIEW_API_BASE_URL} />
        ) : activeTab === 'compute' ? (
          <ComputeDevTab isWorking={false} />
        ) : activeTab === 'agent' ? (
          <AgentTab viewApiBaseUrl={VIEW_API_BASE_URL} />
        ) : activeTab === 'runner' ? (
          <RunnerTab viewApiBaseUrl={RUNNER_VIEW_API_BASE_URL} />
        ) : activeTab === 'tv' ? (
          <TradingViewTestTab viewApiBaseUrl={VIEW_API_BASE_URL} />
        ) : activeTab === 'indexViews' ? (
          <ViewPlaygroundTab viewApiBaseUrl={VIEW_API_BASE_URL} viewKind="index" />
        ) : null}
      </section>
    </main>
  );
}

export default App;
