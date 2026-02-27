export type TokenMeta = {
  symbol: string;
  mint: string;
  decimals: number;
};

const TOKENS: TokenMeta[] = [
  {
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
  },
  {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
  },
];

const BY_SYMBOL = new Map(TOKENS.map((token) => [token.symbol, token]));
const BY_MINT = new Map(TOKENS.map((token) => [token.mint, token]));

export function resolveToken(value: string): TokenMeta | null {
  const normalized = value.trim();
  return BY_SYMBOL.get(normalized.toUpperCase()) ?? BY_MINT.get(normalized) ?? null;
}

export function listSupportedTokens(): TokenMeta[] {
  return TOKENS;
}

export function formatTokenAmount(amountAtomic: string, decimals: number): string {
  const amount = BigInt(amountAtomic);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(decimals, '0').replace(/0+$/, '');

  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function parseUiAmountToAtomic(amountUi: string, decimals: number): bigint {
  const trimmed = amountUi.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Amount must be a positive number.');
  }

  const [wholePart, fractionPart = ''] = trimmed.split('.');
  const whole = BigInt(wholePart);
  const base = BigInt(10) ** BigInt(decimals);

  const boundedFraction = fractionPart.slice(0, decimals).padEnd(decimals, '0');
  const fraction = boundedFraction.length > 0 ? BigInt(boundedFraction) : 0n;

  return whole * base + fraction;
}
