import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { createCloseAccountInstruction } from '@solana/spl-token';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import './App.css';
import { listSupportedTokens } from './constants/tokens';
import {
  sendIdlInstruction,
  simulateIdlInstruction,
} from '@agentform/apppack-runtime/idlDeclarativeRuntime';
import { prepareMetaOperation } from '@agentform/apppack-runtime/metaIdlRuntime';
import {
  buildDerivedFromReadOutputSource,
  buildReadOnlyHighlightsFromSpec,
  parseBuilderInputValue,
  readBuilderPath,
} from './app/builderHelpers';
import { BuilderTab } from './app/components/BuilderTab';
import { CommandTab } from './app/components/CommandTab';
import { type BuilderPreparedStepResult, useBuilderController } from './app/useBuilderController';
import { useCommandController } from './app/useCommandController';

const DEFAULT_VIEW_API_BASE_URL = 'https://apppack-view-service.onrender.com';
const VIEW_API_BASE_URL = String(import.meta.env.VITE_VIEW_API_BASE_URL ?? DEFAULT_VIEW_API_BASE_URL)
  .trim()
  .replace(/\/+$/, '');
const QUICK_PREFILL_META_RUN_COMMAND =
  '/meta-run orca-whirlpool-mainnet swap_exact_in {"token_in_mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","token_out_mint":"So11111111111111111111111111111111111111112","amount_in":"10000","slippage_bps":50,"estimated_out":"100000","whirlpool":"Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE","unwrap_sol_output":true} --simulate';

type AppTab = 'command' | 'builder';

type RemoteViewRunResponse = {
  ok: boolean;
  protocol?: string;
  operation?: string;
  items?: unknown[];
  query?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  error?: string;
};

function App() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [activeTab, setActiveTab] = useState<AppTab>('builder');
  const [isBuilderWorking, setIsBuilderWorking] = useState(false);

  const builder = useBuilderController();
  const {
    builderProtocols,
    builderProtocolId,
    builderApps,
    builderAppId,
    builderAppStepIndex,
    setBuilderAppStepCompleted,
    selectedBuilderApp,
    selectedBuilderAppStep,
    selectedBuilderAppSelectUi,
    selectedBuilderAppSelectableItems,
    selectedBuilderSelectedItemValue,
    showBuilderSelectableItems,
    selectedBuilderOperation,
    builderOperations,
    builderOperationId,
    builderViewMode,
    visibleBuilderInputs,
    hiddenBuilderInputsCount,
    isBuilderAppMode,
    builderAppSubmitMode,
    setBuilderAppSubmitMode,
    builderSimulate,
    setBuilderSimulate,
    builderStatusText,
    builderRawDetails,
    builderShowRawDetails,
    setBuilderStatusText,
    setBuilderRawDetails,
    setBuilderShowRawDetails,
    clearBuilderAppProgressFrom,
    applyBuilderAppStepResult,
    canOpenBuilderAppStep,
    setBuilderResult,
    builderInputValues,
    handleBuilderPrefillExample,
    handleBuilderModeEndUser,
    handleBuilderModeGeek,
    handleBuilderProtocolSelect,
    handleBuilderAppSelect,
    handleBuilderOperationSelect,
    handleBuilderAppOpenStep,
    handleBuilderAppBackStep,
    handleBuilderAppSelectItem,
    handleBuilderAppResetCurrentStep,
    handleBuilderInputChange,
    handleBuilderToggleRawDetails,
  } = builder;

  const supportedTokens = useMemo(
    () => listSupportedTokens().map((token) => `${token.symbol} (${token.mint})`).join(', '),
    [],
  );

  const command = useCommandController({
    connection,
    wallet,
    supportedTokens,
    viewApiBaseUrl: VIEW_API_BASE_URL,
    defaultViewApiBaseUrl: DEFAULT_VIEW_API_BASE_URL,
  });
  const {
    messages,
    commandInput,
    setCommandInput,
    isWorking: isCommandWorking,
    handleCommandSubmit,
    pushMessage,
  } = command;

  const isWorking = isBuilderWorking || isCommandWorking;

  async function runRemoteViewRun(options: {
    protocolId: string;
    operationId: string;
    input: Record<string, unknown>;
    limit?: number;
  }): Promise<RemoteViewRunResponse> {
    if (!VIEW_API_BASE_URL) {
      throw new Error('View API base URL is not configured (VITE_VIEW_API_BASE_URL).');
    }

    let response: Response;
    try {
      response = await fetch(`${VIEW_API_BASE_URL}/view-run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          protocol_id: options.protocolId,
          operation_id: options.operationId,
          input: options.input,
          ...(typeof options.limit === 'number' ? { limit: options.limit } : {}),
        }),
      });
    } catch {
      throw new Error(
        `Failed to reach View API at ${VIEW_API_BASE_URL}. Check service uptime and CORS preflight configuration for /view-run.`,
      );
    }

    const bodyText = await response.text();
    let parsed: unknown = null;
    if (bodyText.trim().length > 0) {
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const detail =
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : bodyText || response.statusText;
      throw new Error(`View API error ${response.status}: ${detail}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('View API returned invalid JSON response.');
    }

    const result = parsed as RemoteViewRunResponse;
    if (!result.ok) {
      throw new Error(result.error ?? 'View API returned ok=false.');
    }

    return result;
  }

  function buildMetaPostInstructions(
    postSpecs: Array<{
      kind: 'spl_token_close_account';
      account: string;
      destination: string;
      owner: string;
      tokenProgram: string;
    }>,
  ): TransactionInstruction[] {
    return postSpecs.map((spec) => {
      if (spec.kind !== 'spl_token_close_account') {
        throw new Error(`Unsupported meta post instruction kind: ${spec.kind}`);
      }

      return createCloseAccountInstruction(
        new PublicKey(spec.account),
        new PublicKey(spec.destination),
        new PublicKey(spec.owner),
        [],
        new PublicKey(spec.tokenProgram),
      );
    });
  }

  function buildBuilderPreInstructions(): TransactionInstruction[] {
    // UI stays protocol-agnostic: no protocol/account-name heuristics here.
    // Pre-instructions must come from declarative runtime/meta flow.
    return [];
  }

  async function handleBuilderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!builderProtocolId || !selectedBuilderOperation) {
      setBuilderStatusText('Error: Select a protocol and an operation first.');
      setBuilderRawDetails(null);
      return;
    }

    const isReadOnlyOperation = !selectedBuilderOperation.instruction;
    if (!wallet.publicKey && !isReadOnlyOperation) {
      setBuilderStatusText('Error: Connect wallet first.');
      setBuilderRawDetails(null);
      return;
    }
    const walletPublicKey = wallet.publicKey;

    setIsBuilderWorking(true);
    setBuilderStatusText(null);
    setBuilderRawDetails(null);
    setBuilderShowRawDetails(false);

    if (builderViewMode === 'enduser' && selectedBuilderAppStep && selectedBuilderApp) {
      clearBuilderAppProgressFrom(builderAppStepIndex);
      setBuilderAppStepCompleted((prev) => ({
        ...prev,
        [selectedBuilderAppStep.stepId]: false,
      }));
    }

    try {
      const inputPayload: Record<string, unknown> = {};
      for (const [inputName, spec] of Object.entries(selectedBuilderOperation.inputs)) {
        const rawValue = builderInputValues[inputName] ?? '';
        if (!rawValue.trim()) {
          const hasDefault = spec.default !== undefined;
          const hasDiscoverFrom =
            typeof spec.discover_from === 'string' && spec.discover_from.length > 0;
          if (spec.required && !hasDefault && !hasDiscoverFrom) {
            throw new Error(`Missing required input ${inputName}.`);
          }
          continue;
        }

        inputPayload[inputName] = parseBuilderInputValue(rawValue, spec.type, `input ${inputName}`);
      }

      const executionInput = { ...inputPayload };
      if (isReadOnlyOperation) {
        if (!selectedBuilderOperation.readOutput) {
          throw new Error(
            `Read-only operation ${builderProtocolId}/${selectedBuilderOperation.operationId} is missing read_output in Meta IDL.`,
          );
        }

        const response = await runRemoteViewRun({
          protocolId: builderProtocolId,
          operationId: selectedBuilderOperation.operationId,
          input: executionInput,
          limit: 20,
        });

        const remoteItems = response.items ?? [];
        const derived = buildDerivedFromReadOutputSource(
          selectedBuilderOperation.readOutput.source,
          remoteItems,
        );
        const preparedReadOnly: BuilderPreparedStepResult = {
          derived,
          args: {},
          accounts: {},
          instructionName: null,
        };

        const readScope = {
          input: executionInput,
          args: preparedReadOnly.args,
          accounts: preparedReadOnly.accounts,
          derived: preparedReadOnly.derived,
        };
        const readValue = readBuilderPath(readScope, selectedBuilderOperation.readOutput.source);
        if (readValue === undefined) {
          throw new Error(
            `read_output.source ${selectedBuilderOperation.readOutput.source} did not resolve for ${builderProtocolId}/${selectedBuilderOperation.operationId}.`,
          );
        }

        const readOnlyHighlights = buildReadOnlyHighlightsFromSpec(
          selectedBuilderOperation.readOutput,
          readValue,
        );
        const resultLines = [
          `Builder result (${builderProtocolId}/${selectedBuilderOperation.operationId}):`,
          'Read-only operation (view API).',
          ...(readOnlyHighlights.length > 0 ? readOnlyHighlights : []),
        ];
        setBuilderResult(resultLines, {
          input: executionInput,
          viewApi: {
            baseUrl: VIEW_API_BASE_URL,
            protocolId: builderProtocolId,
            operationId: selectedBuilderOperation.operationId,
          },
          readOutput: selectedBuilderOperation.readOutput,
          readOutputValue: readValue,
          response,
          derived: preparedReadOnly.derived,
          args: preparedReadOnly.args,
          accounts: preparedReadOnly.accounts,
        });
        applyBuilderAppStepResult({
          executionInput,
          prepared: preparedReadOnly,
          operationSucceeded: true,
        });
        pushMessage('assistant', resultLines.join('\n'));
        return;
      }

      const prepared = await prepareMetaOperation({
        protocolId: builderProtocolId,
        operationId: selectedBuilderOperation.operationId,
        input: executionInput,
        connection,
        walletPublicKey: walletPublicKey as PublicKey,
      });
      const builderNotes: string[] = [];

      if (!prepared.instructionName) {
        if (!selectedBuilderOperation.readOutput) {
          throw new Error(
            `Read-only operation ${builderProtocolId}/${selectedBuilderOperation.operationId} is missing read_output in Meta IDL.`,
          );
        }
        const readScope = {
          input: executionInput,
          args: prepared.args,
          accounts: prepared.accounts,
          derived: prepared.derived,
        };
        const readValue = readBuilderPath(readScope, selectedBuilderOperation.readOutput.source);
        if (readValue === undefined) {
          throw new Error(
            `read_output.source ${selectedBuilderOperation.readOutput.source} did not resolve for ${builderProtocolId}/${selectedBuilderOperation.operationId}.`,
          );
        }
        const readOnlyHighlights = buildReadOnlyHighlightsFromSpec(
          selectedBuilderOperation.readOutput,
          readValue,
        );
        const resultLines = [
          `Builder result (${builderProtocolId}/${selectedBuilderOperation.operationId}):`,
          'Read-only operation (no instruction to execute).',
          ...(readOnlyHighlights.length > 0 ? readOnlyHighlights : []),
        ];
        setBuilderResult(resultLines, {
          input: executionInput,
          notes: builderNotes,
          readOutput: selectedBuilderOperation.readOutput,
          readOutputValue: readValue,
          derived: prepared.derived,
          args: prepared.args,
          accounts: prepared.accounts,
        });
        applyBuilderAppStepResult({
          executionInput,
          prepared,
          operationSucceeded: true,
        });
        pushMessage('assistant', resultLines.join('\n'));
        return;
      }

      const preInstructions = buildBuilderPreInstructions();
      const postInstructions = buildMetaPostInstructions(prepared.postInstructions);
      const runAsSimulation = isBuilderAppMode ? builderAppSubmitMode === 'simulate' : builderSimulate;

      if (runAsSimulation) {
        const simulation = await simulateIdlInstruction({
          protocolId: prepared.protocolId,
          instructionName: prepared.instructionName,
          args: prepared.args,
          accounts: prepared.accounts,
          remainingAccounts: prepared.remainingAccounts,
          preInstructions,
          postInstructions,
          connection,
          wallet,
        });

        const resultLines = [
          `Builder simulate (${builderProtocolId}/${selectedBuilderOperation.operationId}):`,
          `instruction: ${prepared.instructionName}`,
          `status: ${simulation.ok ? 'success' : 'failed'}`,
          `units: ${simulation.unitsConsumed ?? 'n/a'}`,
          ...(builderNotes.length > 0 ? builderNotes : []),
          `error: ${simulation.error ?? 'none'}`,
          ...(simulation.ok
            ? [
                isBuilderAppMode
                  ? 'next: click Send Transaction when ready.'
                  : 'next: disable simulate and click Send Transaction.',
              ]
            : []),
        ];
        setBuilderResult(resultLines, {
          input: executionInput,
          notes: builderNotes,
          args: prepared.args,
          accounts: prepared.accounts,
          logs: simulation.logs,
        });
        if (simulation.ok) {
          applyBuilderAppStepResult({
            executionInput,
            prepared,
            operationSucceeded: true,
          });
        }
        pushMessage('assistant', resultLines.join('\n'));
        return;
      }

      const sent = await sendIdlInstruction({
        protocolId: prepared.protocolId,
        instructionName: prepared.instructionName,
        args: prepared.args,
        accounts: prepared.accounts,
        remainingAccounts: prepared.remainingAccounts,
        preInstructions,
        postInstructions,
        connection,
        wallet,
      });

      const resultLines = [
        `Builder tx sent (${builderProtocolId}/${selectedBuilderOperation.operationId}):`,
        `instruction: ${prepared.instructionName}`,
        ...(builderNotes.length > 0 ? builderNotes : []),
        `signature: ${sent.signature}`,
        `explorer: ${sent.explorerUrl}`,
      ];
      setBuilderResult(resultLines);
      applyBuilderAppStepResult({
        executionInput,
        prepared,
        operationSucceeded: true,
      });
      pushMessage('assistant', resultLines.join('\n'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown builder error.';
      const text = `Error: ${message}`;
      setBuilderStatusText(text);
      setBuilderRawDetails(null);
      setBuilderShowRawDetails(false);
      pushMessage('assistant', text);
    } finally {
      setIsBuilderWorking(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="card-shell">
        <header className="card-header">
          <div>
            <h1>AppPack — AI Compatible by Design</h1>
            <p>Define once, execute everywhere: AppPack turns protocol specs into deterministic, verifiable on-chain read and transaction flows, so users and AI agents can discover options, simulate outcomes, and execute safely without external SDK lock-in, custom API glue, or fragile wallet-connection UX.</p>
          </div>
          <WalletMultiButton />
        </header>

        <div className="tab-switcher" role="tablist" aria-label="Mode">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'builder'}
            className={activeTab === 'builder' ? 'active' : ''}
            onClick={() => setActiveTab('builder')}
          >
            Forms
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'command'}
            className={activeTab === 'command' ? 'active' : ''}
            onClick={() => setActiveTab('command')}
          >
            Command
          </button>
        </div>

        {activeTab === 'command' ? (
          <CommandTab
            messages={messages}
            isWorking={isWorking}
            commandInput={commandInput}
            onCommandInputChange={setCommandInput}
            onSubmit={handleCommandSubmit}
            onPrefillMetaRun={() => setCommandInput(QUICK_PREFILL_META_RUN_COMMAND)}
          />
        ) : (
          <BuilderTab
            isWorking={isWorking}
            builderViewMode={builderViewMode}
            onModeEndUser={handleBuilderModeEndUser}
            onModeGeek={handleBuilderModeGeek}
            builderProtocols={builderProtocols}
            builderProtocolId={builderProtocolId}
            onSelectProtocol={handleBuilderProtocolSelect}
            builderApps={builderApps}
            builderAppId={builderAppId}
            onSelectApp={handleBuilderAppSelect}
            builderOperations={builderOperations}
            builderOperationId={builderOperationId}
            onSelectOperation={handleBuilderOperationSelect}
            selectedBuilderOperation={selectedBuilderOperation}
            selectedBuilderApp={selectedBuilderApp}
            selectedBuilderAppStep={selectedBuilderAppStep}
            builderAppStepIndex={builderAppStepIndex}
            canOpenBuilderAppStep={canOpenBuilderAppStep}
            onOpenBuilderAppStep={handleBuilderAppOpenStep}
            showBuilderSelectableItems={showBuilderSelectableItems}
            onBackStep={handleBuilderAppBackStep}
            onResetStep={handleBuilderAppResetCurrentStep}
            selectedBuilderAppSelectUi={selectedBuilderAppSelectUi}
            selectedBuilderAppSelectableItems={selectedBuilderAppSelectableItems}
            selectedBuilderSelectedItemValue={selectedBuilderSelectedItemValue}
            onSelectItem={handleBuilderAppSelectItem}
            hiddenBuilderInputsCount={hiddenBuilderInputsCount}
            visibleBuilderInputs={visibleBuilderInputs}
            builderInputValues={builderInputValues}
            onInputChange={handleBuilderInputChange}
            onPrefillExample={handleBuilderPrefillExample}
            isBuilderAppMode={isBuilderAppMode}
            builderAppSubmitMode={builderAppSubmitMode}
            onSetBuilderAppSubmitMode={setBuilderAppSubmitMode}
            builderSimulate={builderSimulate}
            onSetBuilderSimulate={setBuilderSimulate}
            onSubmit={handleBuilderSubmit}
            builderStatusText={builderStatusText}
            builderRawDetails={builderRawDetails}
            builderShowRawDetails={builderShowRawDetails}
            onToggleRawDetails={handleBuilderToggleRawDetails}
          />
        )}
      </section>
    </main>
  );
}

export default App;
