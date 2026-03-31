import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { ActionRunnerSpec } from '@brij-digital/apppack-runtime';
import { parseBuilderInputValue } from '../builderHelpers';
import { loadActionRunnerSpecs, runActionRunnerSpec } from '../actionRunnerClient';

type RunnerTabProps = {
  viewApiBaseUrl: string;
};

type RunnerResult = Awaited<ReturnType<typeof runActionRunnerSpec>>;

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildDefaultInputValues(spec: ActionRunnerSpec | null): Record<string, string> {
  if (!spec) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(spec.inputs).map(([inputName, inputSpec]) => [
      inputName,
      inputSpec.default === undefined ? '' : String(inputSpec.default),
    ]),
  );
}

function parseRunnerInput(rawValue: string, type: string, inputName: string): unknown {
  if (type === 'string') {
    return rawValue;
  }
  return parseBuilderInputValue(rawValue, type, inputName);
}

export function RunnerTab({ viewApiBaseUrl }: RunnerTabProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [runnerSpecs, setRunnerSpecs] = useState<ActionRunnerSpec[]>([]);
  const [runnerId, setRunnerId] = useState('');
  const [runnerInputValues, setRunnerInputValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<RunnerResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadActionRunnerSpecs();
        if (cancelled) {
          return;
        }
        setRunnerSpecs(loaded);
        const first = loaded[0] ?? null;
        setRunnerId(first?.actionId ?? '');
        setRunnerInputValues(buildDefaultInputValues(first));
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : 'Failed to load runner specs.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRunner = useMemo(
    () => runnerSpecs.find((entry) => entry.actionId === runnerId) ?? null,
    [runnerSpecs, runnerId],
  );

  const handleRunnerSelect = (nextRunnerId: string) => {
    setRunnerId(nextRunnerId);
    const nextRunner = runnerSpecs.find((entry) => entry.actionId === nextRunnerId) ?? null;
    setRunnerInputValues(buildDefaultInputValues(nextRunner));
    setResult(null);
    setErrorText(null);
  };

  const handleInputChange = (inputName: string, value: string) => {
    setRunnerInputValues((current) => ({
      ...current,
      [inputName]: value,
    }));
  };

  const handleRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRunner) {
      setErrorText('Select a runner first.');
      return;
    }
    setIsRunning(true);
    setErrorText(null);
    setResult(null);
    try {
      const parsedInput: Record<string, unknown> = {};
      for (const [inputName, inputSpec] of Object.entries(selectedRunner.inputs)) {
        const rawValue = runnerInputValues[inputName] ?? '';
        if (!rawValue.trim()) {
          if (inputSpec.required !== false && inputSpec.default === undefined) {
            throw new Error(`Missing required runner input ${inputName}.`);
          }
          continue;
        }
        parsedInput[inputName] = parseRunnerInput(rawValue, inputSpec.type, inputName);
      }

      const executed = await runActionRunnerSpec({
        spec: selectedRunner,
        input: parsedInput,
        viewApiBaseUrl,
        connection,
        walletPublicKey: wallet.publicKey,
      });
      setResult(executed);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Runner failed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="view-playground-shell">
      <header className="view-playground-header">
        <div>
          <h2>Runner</h2>
          <p>Run a minimal linear action pipeline declared in a runner spec.</p>
        </div>
        <div className="view-playground-target">
          <span>Wallet</span>
          <code>{wallet.publicKey?.toBase58() ?? 'not connected'}</code>
        </div>
      </header>

      {isLoading ? (
        <div className="view-playground-info">Loading runner specs...</div>
      ) : null}
      {errorText ? (
        <div className="view-playground-error">{errorText}</div>
      ) : null}

      <form className="view-playground-form" onSubmit={handleRun}>
        <label>
          <span>Runner</span>
          <select value={runnerId} onChange={(event) => handleRunnerSelect(event.target.value)} disabled={isLoading || isRunning}>
            {runnerSpecs.map((spec) => (
              <option key={spec.actionId} value={spec.actionId}>
                {spec.title}
              </option>
            ))}
          </select>
        </label>
        {selectedRunner ? (
          <>
            {Object.entries(selectedRunner.inputs).map(([inputName, inputSpec]) => (
              <label key={inputName}>
                <span>{inputName}</span>
                <input
                  value={runnerInputValues[inputName] ?? ''}
                  onChange={(event) => handleInputChange(inputName, event.target.value)}
                  disabled={isRunning}
                  placeholder={inputSpec.description ?? inputSpec.type}
                />
              </label>
            ))}
            <div className="view-playground-actions">
              <button type="submit" disabled={isRunning}>
                {isRunning ? 'Running...' : 'Run Runner'}
              </button>
            </div>
          </>
        ) : null}
      </form>

      {selectedRunner ? (
        <div className="view-playground-results">
          <section className="view-playground-panel">
            <h3>Spec</h3>
            <pre>{formatJson(selectedRunner)}</pre>
          </section>
          <section className="view-playground-panel">
            <h3>Final Output</h3>
            <pre>{result ? formatJson(result.output) : 'Run a runner to see the final output.'}</pre>
          </section>
          <section className="view-playground-panel">
            <h3>Steps</h3>
            <pre>{result ? formatJson(result.steps) : 'Step results will appear here.'}</pre>
          </section>
        </div>
      ) : null}
    </section>
  );
}
