import { parseUiAmountToAtomic, resolveToken } from '../constants/tokens';

export type SwapCommand = {
  kind: 'swap';
  inputToken: string;
  outputToken: string;
  amountUi: string;
  amountAtomic: string;
  inputMint: string;
  outputMint: string;
  slippageBps: number;
};

export type ParsedCommand =
  | { kind: 'swap'; value: SwapCommand }
  | { kind: 'confirm' }
  | { kind: 'help' };

export function parseCommand(raw: string): ParsedCommand {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('Enter a command. Try /help.');
  }

  const [command, ...args] = trimmed.split(/\s+/);

  if (command === '/help') {
    return { kind: 'help' };
  }

  if (command === '/confirm') {
    return { kind: 'confirm' };
  }

  if (command !== '/swap') {
    throw new Error(`Unknown command: ${command}. Try /help.`);
  }

  if (args.length < 3 || args.length > 4) {
    throw new Error('Usage: /swap <INPUT_TOKEN> <OUTPUT_TOKEN> <AMOUNT> [SLIPPAGE_BPS]');
  }

  const [inputRaw, outputRaw, amountUi, slippageRaw] = args;
  const inputToken = resolveToken(inputRaw);
  const outputToken = resolveToken(outputRaw);

  if (!inputToken) {
    throw new Error(`Unsupported input token: ${inputRaw}`);
  }

  if (!outputToken) {
    throw new Error(`Unsupported output token: ${outputRaw}`);
  }

  if (inputToken.mint === outputToken.mint) {
    throw new Error('Input and output token must differ.');
  }

  const amountAtomic = parseUiAmountToAtomic(amountUi, inputToken.decimals);
  if (amountAtomic <= 0n) {
    throw new Error('Amount must be greater than zero.');
  }

  const slippageBps = slippageRaw ? Number(slippageRaw) : 50;
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 5000) {
    throw new Error('Slippage must be an integer between 1 and 5000 bps.');
  }

  return {
    kind: 'swap',
    value: {
      kind: 'swap',
      inputToken: inputToken.symbol,
      outputToken: outputToken.symbol,
      inputMint: inputToken.mint,
      outputMint: outputToken.mint,
      amountUi,
      amountAtomic: amountAtomic.toString(),
      slippageBps,
    },
  };
}
