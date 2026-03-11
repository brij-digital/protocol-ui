import type { Idl } from '@coral-xyz/anchor';
import type { Connection, PublicKey } from '@solana/web3.js';
import { runOrcaQuoteDataResolver } from './protocols/orca/resolver';

export type ResolverStepResolved = {
  name: string;
  resolver: string;
  [key: string]: unknown;
};

export type ResolverRuntimeContext = {
  protocolId: string;
  programId: string;
  connection: Connection;
  walletPublicKey: PublicKey;
  idl: Idl;
  scope: Record<string, unknown>;
};

type ResolverExecutor = (step: ResolverStepResolved, ctx: ResolverRuntimeContext) => Promise<unknown>;

const RESOLVER_EXECUTORS: Record<string, ResolverExecutor> = {
  orca_quote_data: runOrcaQuoteDataResolver,
};

export async function runRegisteredResolverStep(step: ResolverStepResolved, ctx: ResolverRuntimeContext): Promise<unknown> {
  const executor = RESOLVER_EXECUTORS[step.resolver];
  if (!executor) {
    throw new Error(`Unsupported resolver: ${step.resolver}`);
  }

  return executor(step, ctx);
}
