import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { WalletContextProvider } from './WalletContextProvider';
import './index.css';
import '@solana/wallet-adapter-react-ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletContextProvider>
      <App />
    </WalletContextProvider>
  </StrictMode>,
);
