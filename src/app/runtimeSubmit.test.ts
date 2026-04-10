import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, Transaction, type SendOptions } from '@solana/web3.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import type { Connection } from '@solana/web3.js';
import {
  sendPreparedExecutionDraft,
  simulatePreparedExecutionDraft,
  type PreparedExecutionDraft,
} from './runtimeSubmit';

const runtimeMocks = vi.hoisted(() => ({
  previewIdlInstructionMock: vi.fn(),
}));

vi.mock('@brij-digital/apppack-runtime', () => ({
  previewIdlInstruction: runtimeMocks.previewIdlInstructionMock,
}));

function makeDraft(wallet: PublicKey): PreparedExecutionDraft {
  const target = Keypair.generate().publicKey;
  const tokenAccount = Keypair.generate().publicKey;

  return {
    protocolId: 'spec-runtime-mainnet',
    operationId: 'execute_swap',
    instructionName: 'execute_swap',
    args: { amount: '7' },
    accounts: {
      target: target.toBase58(),
    },
    remainingAccounts: [
      {
        pubkey: target.toBase58(),
        isSigner: false,
        isWritable: true,
      },
    ],
    preInstructions: [
      {
        kind: 'system_transfer',
        from: wallet.toBase58(),
        to: target.toBase58(),
        lamports: '42',
      },
    ],
    postInstructions: [
      {
        kind: 'spl_token_close_account',
        account: tokenAccount.toBase58(),
        destination: wallet.toBase58(),
        owner: wallet.toBase58(),
        tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
      },
    ],
  };
}

describe('runtimeSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('simulates a prepared draft from previewIdlInstruction output', async () => {
    const signer = Keypair.generate();
    const target = Keypair.generate().publicKey;
    const draft = makeDraft(signer.publicKey);
    let simulationSummary: Record<string, unknown> | null = null;

    runtimeMocks.previewIdlInstructionMock.mockResolvedValue({
      protocolId: draft.protocolId,
      instructionName: draft.instructionName,
      programId: SystemProgram.programId.toBase58(),
      dataBase64: 'AQID',
      keys: [
        { pubkey: signer.publicKey.toBase58(), isSigner: true, isWritable: true },
        { pubkey: target.toBase58(), isSigner: false, isWritable: true },
      ],
      args: draft.args,
      accounts: draft.accounts,
      resolvedAccounts: {
        authority: signer.publicKey.toBase58(),
        target: target.toBase58(),
      },
    });

    const connection = {
      getLatestBlockhash: async () => ({
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 99,
      }),
      simulateTransaction: async (tx: Transaction) => {
        simulationSummary = {
          instructionCount: tx.instructions.length,
          feePayer: tx.feePayer?.toBase58() ?? null,
          mainProgramId: tx.instructions[1]?.programId.toBase58() ?? null,
          mainKeyCount: tx.instructions[1]?.keys.length ?? 0,
        };
        return {
          value: {
            err: null,
            logs: ['sim ok'],
            unitsConsumed: 321,
          },
        };
      },
    } as unknown as Connection;

    const wallet = {
      publicKey: signer.publicKey,
    } as WalletContextState;

    const result = await simulatePreparedExecutionDraft({
      draft,
      connection,
      wallet,
    });

    expect(runtimeMocks.previewIdlInstructionMock).toHaveBeenCalledWith({
      protocolId: draft.protocolId,
      instructionName: draft.instructionName,
      args: draft.args,
      accounts: draft.accounts,
      remainingAccounts: draft.remainingAccounts,
      walletPublicKey: signer.publicKey,
    });
    expect(result).toEqual({
      ok: true,
      logs: ['sim ok'],
      unitsConsumed: 321,
      error: null,
      accounts: [],
    });
    expect(simulationSummary).toEqual({
      instructionCount: 3,
      feePayer: signer.publicKey.toBase58(),
      mainProgramId: SystemProgram.programId.toBase58(),
      mainKeyCount: 2,
    });
  });

  it('signs, submits, and confirms a prepared draft', async () => {
    const signer = Keypair.generate();
    const target = Keypair.generate().publicKey;
    const draft = makeDraft(signer.publicKey);
    const statuses: string[] = [];
    let submitted: { signature: string; explorerUrl: string } | null = null;
    let sendSummary: Record<string, unknown> | null = null;
    let confirmSummary: Record<string, unknown> | null = null;

    runtimeMocks.previewIdlInstructionMock.mockResolvedValue({
      protocolId: draft.protocolId,
      instructionName: draft.instructionName,
      programId: SystemProgram.programId.toBase58(),
      dataBase64: 'AQID',
      keys: [
        { pubkey: signer.publicKey.toBase58(), isSigner: true, isWritable: true },
        { pubkey: target.toBase58(), isSigner: false, isWritable: true },
      ],
      args: draft.args,
      accounts: draft.accounts,
      resolvedAccounts: {
        authority: signer.publicKey.toBase58(),
        target: target.toBase58(),
      },
    });

    const connection = {
      getLatestBlockhash: async () => ({
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 77,
      }),
      simulateTransaction: async () => ({
        value: {
          err: null,
          logs: ['send ok'],
        },
      }),
      sendRawTransaction: async (raw: Uint8Array, opts?: SendOptions) => {
        sendSummary = {
          rawLength: raw.length,
          skipPreflight: opts?.skipPreflight ?? null,
          maxRetries: opts?.maxRetries ?? null,
        };
        return 'sig-123';
      },
      confirmTransaction: async (payload: unknown, commitment: string) => {
        confirmSummary = { payload, commitment };
        return { value: { err: null } };
      },
    } as unknown as Connection;

    const wallet = {
      publicKey: signer.publicKey,
      signTransaction: async (tx: Transaction) => {
        tx.partialSign(signer);
        return tx;
      },
    } as WalletContextState;

    const result = await sendPreparedExecutionDraft({
      draft,
      connection,
      wallet,
      onStatus: (status) => {
        statuses.push(status);
      },
      onSubmitted: (payload) => {
        submitted = payload;
      },
    });

    expect(statuses).toEqual([
      'preparing',
      'simulating',
      'awaiting_wallet_approval',
      'submitting',
      'submitted',
      'confirming',
      'confirmed',
    ]);
    expect(result).toEqual({
      signature: 'sig-123',
      explorerUrl: 'https://solscan.io/tx/sig-123',
    });
    expect(submitted).toEqual(result);
    expect(sendSummary).toEqual({
      rawLength: expect.any(Number),
      skipPreflight: false,
      maxRetries: 3,
    });
    expect(confirmSummary).toEqual({
      payload: {
        signature: 'sig-123',
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 77,
      },
      commitment: 'confirmed',
    });
  });
});
