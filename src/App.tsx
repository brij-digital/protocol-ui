import { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import './App.css';
import { PumpWorkspaceTab } from './app/components/PumpWorkspaceTab';
import { RawOperationsTab } from './app/components/RawOperationsTab';
import { TradingViewTestTab } from './app/components/TradingViewTestTab';
import { ViewPlaygroundTab } from './app/components/ViewPlaygroundTab';

const DEFAULT_VIEW_API_BASE_URL = 'https://apppack-view-service.onrender.com';
const VIEW_API_BASE_URL = String(import.meta.env.VITE_VIEW_API_BASE_URL ?? DEFAULT_VIEW_API_BASE_URL)
  .trim()
  .replace(/\/+$/, '');

type AppTab = 'views' | 'pump' | 'raw' | 'tv';

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('pump');

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
            aria-selected={activeTab === 'pump'}
            className={activeTab === 'pump' ? 'active' : ''}
            onClick={() => setActiveTab('pump')}
          >
            Pump
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'views'}
            className={activeTab === 'views' ? 'active' : ''}
            onClick={() => setActiveTab('views')}
          >
            Views
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'raw'}
            className={activeTab === 'raw' ? 'active' : ''}
            onClick={() => setActiveTab('raw')}
          >
            Raw Ops
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tv'}
            className={activeTab === 'tv' ? 'active' : ''}
            onClick={() => setActiveTab('tv')}
          >
            TradingView
          </button>
        </div>

        {activeTab === 'pump' ? (
          <PumpWorkspaceTab viewApiBaseUrl={VIEW_API_BASE_URL} />
        ) : activeTab === 'raw' ? (
          <RawOperationsTab viewApiBaseUrl={VIEW_API_BASE_URL} />
        ) : activeTab === 'tv' ? (
          <TradingViewTestTab viewApiBaseUrl={VIEW_API_BASE_URL} />
        ) : activeTab === 'views' ? (
          <ViewPlaygroundTab viewApiBaseUrl={VIEW_API_BASE_URL} />
        ) : null}
      </section>
    </main>
  );
}

export default App;
