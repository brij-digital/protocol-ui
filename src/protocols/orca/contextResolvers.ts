import { BN, BorshAccountsCoder, utils } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import type { ContextExecutor, ContextRuntimeContext, ContextStepResolved } from '../../lib/metaContextRegistry';

type RpcCommitment = 'processed' | 'confirmed' | 'finalized';

function asString(value: unknown, label: string): string {
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`${label} must be a string.`);
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

function asRpcCommitment(value: unknown, label: string): RpcCommitment {
  const normalized = asString(value, label);
  if (normalized === 'processed' || normalized === 'confirmed' || normalized === 'finalized') {
    return normalized;
  }
  throw new Error(`${label} must be one of processed|confirmed|finalized.`);
}

function asNumberishBigint(value: unknown, label: string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new Error(`${label} must be a bigint-compatible integer.`);
}

function normalizeRuntimeValue(value: unknown): unknown {
  if (BN.isBN(value)) {
    return (value as BN).toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
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

function comparePair(tokenA: string, tokenB: string, tokenIn: string, tokenOut: string): boolean {
  return (tokenA === tokenIn && tokenB === tokenOut) || (tokenA === tokenOut && tokenB === tokenIn);
}

async function runContextOrcaWhirlpoolPoolsForPair(
  step: ContextStepResolved,
  ctx: ContextRuntimeContext,
): Promise<unknown> {
  const tokenInMint = asString(step.token_in_mint, `context:${step.name}:token_in_mint`);
  const tokenOutMint = asString(step.token_out_mint, `context:${step.name}:token_out_mint`);
  const accountType =
    step.account_type === undefined ? 'Whirlpool' : asString(step.account_type, `context:${step.name}:account_type`);
  const commitment: RpcCommitment =
    step.commitment === undefined
      ? 'confirmed'
      : asRpcCommitment(step.commitment, `context:${step.name}:commitment`);
  const programId =
    step.program_id === undefined
      ? new PublicKey(ctx.programId)
      : asPubkey(step.program_id, `context:${step.name}:program_id`);

  const idlAccount = ctx.idl.accounts?.find((entry) => entry.name === accountType);
  if (!idlAccount || !idlAccount.discriminator || idlAccount.discriminator.length !== 8) {
    throw new Error(`context:${step.name}:account_type ${accountType} is missing discriminator in IDL.`);
  }

  const discriminatorBytes = Uint8Array.from(idlAccount.discriminator);
  const discriminatorBase58 = utils.bytes.bs58.encode(discriminatorBytes);

  const accountInfos = await ctx.connection.getProgramAccounts(programId, {
    commitment,
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: discriminatorBase58,
        },
      },
    ],
  });

  const coder = new BorshAccountsCoder(ctx.idl);
  const candidates: Array<Record<string, unknown>> = [];
  for (const info of accountInfos) {
    let decoded: Record<string, unknown>;
    try {
      decoded = normalizeRuntimeValue(coder.decode(accountType, info.account.data)) as Record<string, unknown>;
    } catch {
      continue;
    }

    const tokenMintA = asString(decoded.token_mint_a, `context:${step.name}:decoded.token_mint_a`);
    const tokenMintB = asString(decoded.token_mint_b, `context:${step.name}:decoded.token_mint_b`);
    if (!comparePair(tokenMintA, tokenMintB, tokenInMint, tokenOutMint)) {
      continue;
    }

    const aToB = tokenMintA === tokenInMint && tokenMintB === tokenOutMint;
    const liquidity = asNumberishBigint(decoded.liquidity, `context:${step.name}:decoded.liquidity`);
    candidates.push({
      protocol: 'orca-whirlpool',
      whirlpool: info.pubkey.toBase58(),
      tokenInMint: tokenInMint,
      tokenOutMint: tokenOutMint,
      tokenMintA,
      tokenMintB,
      aToB,
      tickArrayDirection: aToB ? -1 : 1,
      tickSpacing: asNumberishBigint(decoded.tick_spacing, `context:${step.name}:decoded.tick_spacing`).toString(),
      liquidity: liquidity.toString(),
    });
  }

  candidates.sort((left, right) => {
    const leftLiquidity = BigInt(String(left.liquidity ?? '0'));
    const rightLiquidity = BigInt(String(right.liquidity ?? '0'));
    if (leftLiquidity === rightLiquidity) {
      return String(left.whirlpool).localeCompare(String(right.whirlpool));
    }
    return rightLiquidity > leftLiquidity ? 1 : -1;
  });

  return candidates;
}

export const ORCA_CONTEXT_EXECUTORS: Record<string, ContextExecutor> = {
  'context.orca_whirlpool_pools_for_pair': runContextOrcaWhirlpoolPoolsForPair,
};
