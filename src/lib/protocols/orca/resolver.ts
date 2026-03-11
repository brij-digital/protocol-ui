import { BN, BorshAccountsCoder } from '@coral-xyz/anchor';
import { getTickArrayStartTickIndex } from '@orca-so/whirlpools-core';
import { PublicKey } from '@solana/web3.js';
import type { ResolverRuntimeContext, ResolverStepResolved } from '../../metaResolverRegistry';

function normalizeRuntimeValue(value: unknown): unknown {
  if (BN.isBN(value)) {
    return (value as BN).toString();
  }

  if (value instanceof PublicKey) {
    return value.toBase58();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeRuntimeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, normalizeRuntimeValue(nested)]),
    );
  }

  return value;
}

function asPubkey(value: unknown, label: string): PublicKey {
  if (value instanceof PublicKey) {
    return value;
  }
  if (typeof value === 'string') {
    return new PublicKey(value);
  }
  throw new Error(`${label} must be a public key.`);
}

function asBool(value: unknown, label: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error(`${label} must be boolean.`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must resolve to an object.`);
  }
  return value as Record<string, unknown>;
}

function asIntegerString(value: unknown, label: string): string {
  const normalized = typeof value === 'number' || typeof value === 'bigint' ? value.toString() : value;
  if (typeof normalized !== 'string' || !/^-?\d+$/.test(normalized)) {
    throw new Error(`${label} must be an integer string.`);
  }
  return normalized;
}

function asSafeInteger(value: unknown, label: string): number {
  const parsed = Number(asIntegerString(value, label));
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return parsed;
}

function getRecordValue(record: Record<string, unknown>, candidates: string[], label: string): unknown {
  for (const candidate of candidates) {
    if (record[candidate] !== undefined) {
      return record[candidate];
    }
  }
  throw new Error(`Missing field ${label}. Expected one of: ${candidates.join(', ')}`);
}

function deriveOrcaTickArrayPda(programId: PublicKey, whirlpool: PublicKey, startTickIndex: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('tick_array'), whirlpool.toBuffer(), new TextEncoder().encode(startTickIndex.toString())],
    programId,
  )[0];
}

function getWhirlpoolTickSpacing(whirlpoolData: Record<string, unknown>, label: string): number {
  return asSafeInteger(
    getRecordValue(whirlpoolData, ['tick_spacing', 'tickSpacing'], 'tick_spacing'),
    `${label}:tick_spacing`,
  );
}

function getWhirlpoolCurrentTick(whirlpoolData: Record<string, unknown>, label: string): number {
  return asSafeInteger(
    getRecordValue(whirlpoolData, ['tick_current_index', 'tickCurrentIndex'], 'tick_current_index'),
    `${label}:tick_current_index`,
  );
}

async function loadWhirlpoolData(options: {
  step: ResolverStepResolved;
  ctx: ResolverRuntimeContext;
  coder: BorshAccountsCoder;
  whirlpoolAddress: PublicKey;
}): Promise<Record<string, unknown>> {
  if (options.step.whirlpool_data !== undefined) {
    return asRecord(options.step.whirlpool_data, `resolver.orca_quote_data:${options.step.name}:whirlpool_data`);
  }

  const info = await options.ctx.connection.getAccountInfo(options.whirlpoolAddress, 'confirmed');
  if (!info) {
    throw new Error(
      `resolver.orca_quote_data:${options.step.name}:whirlpool not found (${options.whirlpoolAddress.toBase58()}).`,
    );
  }

  const decoded = options.coder.decode('Whirlpool', info.data) as Record<string, unknown>;
  return normalizeRuntimeValue(decoded) as Record<string, unknown>;
}

export async function runOrcaQuoteDataResolver(step: ResolverStepResolved, ctx: ResolverRuntimeContext): Promise<unknown> {
  const whirlpoolAddress = asPubkey(step.whirlpool, `resolver.orca_quote_data:${step.name}:whirlpool`);
  const aToB = asBool(step.a_to_b, `resolver.orca_quote_data:${step.name}:a_to_b`);

  const coder = new BorshAccountsCoder(ctx.idl);
  const whirlpoolData = await loadWhirlpoolData({ step, ctx, coder, whirlpoolAddress });
  const tickSpacing = getWhirlpoolTickSpacing(whirlpoolData, `resolver.orca_quote_data:${step.name}:whirlpool`);
  const tickCurrentIndex = getWhirlpoolCurrentTick(whirlpoolData, `resolver.orca_quote_data:${step.name}:whirlpool`);

  if (tickSpacing <= 0) {
    throw new Error(`resolver.orca_quote_data:${step.name}:tick_spacing must be > 0.`);
  }

  const directionSign = aToB ? -1 : 1;
  const baseStartTickIndex = getTickArrayStartTickIndex(tickCurrentIndex, tickSpacing);
  const tickArraySpan = tickSpacing * 88;
  const programId = new PublicKey(ctx.programId);

  const startTickIndexes = [0, 1, 2].map((index) => baseStartTickIndex + directionSign * index * tickArraySpan);
  const tickArrayPubkeys = startTickIndexes.map((startTickIndex) =>
    deriveOrcaTickArrayPda(programId, whirlpoolAddress, startTickIndex),
  );
  const infos = await ctx.connection.getMultipleAccountsInfo(tickArrayPubkeys, 'confirmed');

  const finalAddresses: string[] = [];
  const tickArrays: Array<Record<string, unknown>> = [];

  for (let index = 0; index < tickArrayPubkeys.length; index += 1) {
    const info = infos[index];
    const address = tickArrayPubkeys[index].toBase58();

    if (!info) {
      throw new Error(`resolver.orca_quote_data:${step.name}: required tick array missing at index ${index} (${address}).`);
    }

    const decoded = coder.decode('TickArray', info.data) as Record<string, unknown>;
    finalAddresses.push(address);
    tickArrays.push(normalizeRuntimeValue(decoded) as Record<string, unknown>);
  }

  let oracleData: Record<string, unknown> | null = null;
  if (step.oracle !== undefined) {
    const oracleAddress = asPubkey(step.oracle, `resolver.orca_quote_data:${step.name}:oracle`);
    const info = await ctx.connection.getAccountInfo(oracleAddress, 'confirmed');
    if (info) {
      const decoded = coder.decode('Oracle', info.data) as Record<string, unknown>;
      oracleData = normalizeRuntimeValue(decoded) as Record<string, unknown>;
    }
  }

  return {
    whirlpool: whirlpoolData,
    oracle: oracleData,
    candidates: [
      {
        tickArray0: finalAddresses[0],
        tickArray1: finalAddresses[1],
        tickArray2: finalAddresses[2],
        tick_arrays: tickArrays,
      },
    ],
    resolved_at_unix_ts: Math.floor(Date.now() / 1000),
  };
}
