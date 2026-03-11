import { PublicKey } from '@solana/web3.js';

export type OrcaTickArraysFromCurrentStep = {
  name: string;
  resolver: string;
  program_id?: unknown;
  whirlpool?: unknown;
  tick_current_index?: unknown;
  tick_spacing?: unknown;
  a_to_b?: unknown;
  count?: unknown;
};

function asPubkey(value: unknown, label: string): PublicKey {
  if (value instanceof PublicKey) {
    return value;
  }

  if (typeof value === 'string') {
    return new PublicKey(value);
  }

  throw new Error(`${label} must be a public key.`);
}

function asInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  throw new Error(`${label} must be an integer.`);
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new Error(`${label} must be a boolean.`);
}

function toInt32LeBytes(value: number, label: string): Uint8Array {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new Error(`${label} must fit in i32.`);
  }

  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return bytes;
}

export async function resolveOrcaTickArraysFromCurrent(step: OrcaTickArraysFromCurrentStep): Promise<string[]> {
  if (
    !step.program_id ||
    !step.whirlpool ||
    step.tick_current_index === undefined ||
    step.tick_spacing === undefined ||
    step.a_to_b === undefined
  ) {
    throw new Error(
      `Resolver ${step.resolver} for ${step.name} missing required fields (program_id, whirlpool, tick_current_index, tick_spacing, a_to_b).`,
    );
  }

  const programId = asPubkey(step.program_id, `${step.resolver}:${step.name}:program_id`);
  const whirlpool = asPubkey(step.whirlpool, `${step.resolver}:${step.name}:whirlpool`);
  const tickCurrentIndex = asInteger(step.tick_current_index, `${step.resolver}:${step.name}:tick_current_index`);
  const tickSpacing = asInteger(step.tick_spacing, `${step.resolver}:${step.name}:tick_spacing`);
  const aToB = asBoolean(step.a_to_b, `${step.resolver}:${step.name}:a_to_b`);
  const count = step.count === undefined ? 3 : asInteger(step.count, `${step.resolver}:${step.name}:count`);

  if (tickSpacing <= 0) {
    throw new Error(`${step.resolver}:${step.name}:tick_spacing must be > 0.`);
  }
  if (count <= 0 || count > 6) {
    throw new Error(`${step.resolver}:${step.name}:count must be between 1 and 6.`);
  }

  const ticksPerArray = 88 * tickSpacing;
  const currentStartIndex = Math.floor(tickCurrentIndex / ticksPerArray) * ticksPerArray;
  const direction = aToB ? -1 : 1;
  const tickArraySeed = new TextEncoder().encode('tick_array');
  const addresses: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const startIndex = currentStartIndex + direction * i * ticksPerArray;
    const startIndexBytes = toInt32LeBytes(startIndex, `${step.resolver}:${step.name}:start_index`);
    const [pda] = PublicKey.findProgramAddressSync(
      [tickArraySeed, whirlpool.toBuffer(), startIndexBytes],
      programId,
    );
    addresses.push(pda.toBase58());
  }

  return addresses;
}
