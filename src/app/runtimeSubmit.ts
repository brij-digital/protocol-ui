import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
} from '@solana/spl-token';
import { Buffer } from 'buffer';
import { previewIdlInstruction } from '@brij-digital/apppack-runtime';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import type { Connection } from '@solana/web3.js';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

type PreparedPreInstructionSpec =
  | {
      kind: 'spl_ata_create_idempotent';
      payer: string;
      ata: string;
      owner: string;
      mint: string;
      tokenProgram: string;
      associatedTokenProgram: string;
    }
  | {
      kind: 'system_transfer';
      from: string;
      to: string;
      lamports: string;
    }
  | {
      kind: 'spl_token_sync_native';
      account: string;
      tokenProgram: string;
    };

type PreparedPostInstructionSpec = {
  kind: 'spl_token_close_account';
  account: string;
  destination: string;
  owner: string;
  tokenProgram: string;
};

export type PreparedExecutionDraft = {
  protocolId: string;
  operationId: string;
  instructionName: string | null;
  args: Record<string, unknown>;
  accounts: Record<string, string>;
  remainingAccounts?: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  preInstructions?: PreparedPreInstructionSpec[];
  postInstructions?: PreparedPostInstructionSpec[];
};

type PreparedExecutionStatus =
  | 'preparing'
  | 'simulating'
  | 'awaiting_wallet_approval'
  | 'submitting'
  | 'submitted'
  | 'confirming'
  | 'confirmed';

function fromBase64(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

function formatSimulationError(simulation: Awaited<ReturnType<Connection['simulateTransaction']>>): string {
  const logs = simulation.value.logs?.join('\n') ?? 'No simulation logs available.';
  return `Simulation failed: ${JSON.stringify(simulation.value.err)}\n${logs}`;
}

async function prepareSignedDraftTransaction(options: {
  draft: PreparedExecutionDraft;
  connection: Connection;
  wallet: WalletContextState;
}) {
  if (!options.draft.instructionName) {
    throw new Error('Draft has no instructionName.');
  }
  if (!options.wallet.publicKey) {
    throw new Error('Connect a wallet first.');
  }

  const preview = await previewIdlInstruction({
    protocolId: options.draft.protocolId,
    instructionName: options.draft.instructionName,
    args: options.draft.args,
    accounts: options.draft.accounts,
    remainingAccounts: options.draft.remainingAccounts,
    walletPublicKey: options.wallet.publicKey,
  });

  const tx = new Transaction();
  for (const instruction of buildPreInstructions(options.draft.preInstructions)) {
    tx.add(instruction);
  }
  tx.add(
    new TransactionInstruction({
      programId: new PublicKey(preview.programId),
      keys: preview.keys.map((key) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: fromBase64(preview.dataBase64),
    }),
  );
  for (const instruction of buildPostInstructions(options.draft.postInstructions)) {
    tx.add(instruction);
  }
  tx.feePayer = options.wallet.publicKey;

  const latestBlockhash = await options.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = latestBlockhash.blockhash;

  return { tx, latestBlockhash };
}

export function buildPostInstructions(
  postSpecs: PreparedPostInstructionSpec[] = [],
): TransactionInstruction[] {
  return postSpecs.map((spec) =>
    createCloseAccountInstruction(
      new PublicKey(spec.account),
      new PublicKey(spec.destination),
      new PublicKey(spec.owner),
      [],
      new PublicKey(spec.tokenProgram),
    ),
  );
}

export function buildPreInstructions(
  preSpecs: PreparedPreInstructionSpec[] = [],
): TransactionInstruction[] {
  return preSpecs.map((spec) => {
    if (spec.kind === 'spl_ata_create_idempotent') {
      return createAssociatedTokenAccountIdempotentInstruction(
        new PublicKey(spec.payer),
        new PublicKey(spec.ata),
        new PublicKey(spec.owner),
        new PublicKey(spec.mint),
        new PublicKey(spec.tokenProgram),
        new PublicKey(spec.associatedTokenProgram),
      );
    }
    if (spec.kind === 'system_transfer') {
      return SystemProgram.transfer({
        fromPubkey: new PublicKey(spec.from),
        toPubkey: new PublicKey(spec.to),
        lamports: Number(spec.lamports),
      });
    }
    return createSyncNativeInstruction(new PublicKey(spec.account), new PublicKey(spec.tokenProgram));
  });
}

export async function simulatePreparedExecutionDraft(options: {
  draft: PreparedExecutionDraft;
  connection: Connection;
  wallet: WalletContextState;
}) {
  const { tx } = await prepareSignedDraftTransaction(options);
  const simulation = await options.connection.simulateTransaction(tx);

  return {
    ok: simulation.value.err === null,
    logs: simulation.value.logs ?? [],
    unitsConsumed: simulation.value.unitsConsumed ?? null,
    error: simulation.value.err ? JSON.stringify(simulation.value.err) : null,
    accounts: [],
  };
}

export async function sendPreparedExecutionDraft(options: {
  draft: PreparedExecutionDraft;
  connection: Connection;
  wallet: WalletContextState;
  onStatus?: (status: PreparedExecutionStatus) => void;
  onSubmitted?: (payload: { signature: string; explorerUrl: string }) => void;
}) {
  if (!options.wallet.signTransaction) {
    throw new Error('Connected wallet does not support transaction signing.');
  }

  options.onStatus?.('preparing');
  const { tx, latestBlockhash } = await prepareSignedDraftTransaction(options);

  options.onStatus?.('simulating');
  const simulation = await options.connection.simulateTransaction(tx);
  if (simulation.value.err) {
    throw new Error(formatSimulationError(simulation));
  }

  options.onStatus?.('awaiting_wallet_approval');
  const signedTx = await options.wallet.signTransaction(tx);

  options.onStatus?.('submitting');
  const signature = await options.connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const explorerUrl = `https://solscan.io/tx/${signature}`;
  options.onSubmitted?.({ signature, explorerUrl });
  options.onStatus?.('submitted');

  options.onStatus?.('confirming');
  await options.connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed',
  );
  options.onStatus?.('confirmed');

  return { signature, explorerUrl };
}
