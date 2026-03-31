import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ConnectionProvider, useLocalStorage } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { type WalletError, type WalletName } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
// @ts-expect-error internal package path; we intentionally bypass WalletProvider to avoid the implicit mobile adapter branch
import { WalletProviderBase } from '../node_modules/@solana/wallet-adapter-react/lib/esm/WalletProviderBase.js';

const RPC_ENDPOINT = 'https://api.brijmail.com/rpc';
const WALLET_STORAGE_KEY = 'walletName';

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const phantom = useMemo(() => new PhantomWalletAdapter(), []);
  const wallets = useMemo(() => [phantom], [phantom]);
  const [walletName, setWalletName] = useLocalStorage<WalletName | null>(WALLET_STORAGE_KEY, phantom.name);
  const isUnloadingRef = useRef(false);

  useEffect(() => {
    function handleBeforeUnload() {
      isUnloadingRef.current = true;
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      isUnloadingRef.current = false;
    };
  }, []);

  const adapter = walletName === null || walletName === phantom.name ? phantom : null;
  const handleSelectWallet = (nextWalletName: WalletName | null) => {
    setWalletName(nextWalletName ?? phantom.name);
  };
  const handleConnectError = () => {
    setWalletName(phantom.name);
  };
  const handleError = (error: WalletError) => {
    console.error(error);
  };

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProviderBase
        wallets={wallets}
        adapter={adapter}
        isUnloadingRef={isUnloadingRef}
        onAutoConnectRequest={async () => {
          await phantom.autoConnect();
        }}
        onConnectError={handleConnectError}
        onError={handleError}
        onSelectWallet={handleSelectWallet}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProviderBase>
    </ConnectionProvider>
  );
}
