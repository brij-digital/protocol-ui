declare module '../node_modules/@solana/wallet-adapter-react/lib/esm/WalletProviderBase.js' {
  import type { Adapter, WalletError, WalletName } from '@solana/wallet-adapter-base';
  import type { ReactNode, RefObject } from 'react';

  export type WalletProviderBaseProps = {
    children: ReactNode;
    wallets: Adapter[];
    adapter: Adapter | null;
    isUnloadingRef: RefObject<boolean>;
    onAutoConnectRequest?: () => Promise<void>;
    onConnectError: () => void;
    onError?: (error: WalletError, adapter?: Adapter) => void;
    onSelectWallet: (walletName: WalletName | null) => void;
  };

  export function WalletProviderBase(props: WalletProviderBaseProps): React.JSX.Element;
}
