import type { SwapCommand } from './commandParser';

const JUPITER_QUOTE_URL = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_URL = 'https://lite-api.jup.ag/swap/v1/swap';

export type JupiterQuote = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
};

export type BuiltSwapTransaction = {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
};

export async function fetchJupiterQuote(command: SwapCommand): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint: command.inputMint,
    outputMint: command.outputMint,
    amount: command.amountAtomic,
    slippageBps: command.slippageBps.toString(),
    swapMode: 'ExactIn',
    restrictIntermediateTokens: 'true',
  });

  const response = await fetch(`${JUPITER_QUOTE_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Quote request failed with ${response.status}`);
  }

  const payload = (await response.json()) as JupiterQuote;
  if (!payload.routePlan || payload.routePlan.length === 0) {
    throw new Error('No route found for this swap command.');
  }

  return payload;
}

export async function buildJupiterSwapTransaction(options: {
  quote: JupiterQuote;
  userPublicKey: string;
}): Promise<BuiltSwapTransaction> {
  const response = await fetch(JUPITER_SWAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quoteResponse: options.quote,
      userPublicKey: options.userPublicKey,
      dynamicComputeUnitLimit: true,
      wrapAndUnwrapSol: true,
      useSharedAccounts: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Swap transaction build failed with ${response.status}`);
  }

  return (await response.json()) as BuiltSwapTransaction;
}

export function decodeBase64Transaction(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
