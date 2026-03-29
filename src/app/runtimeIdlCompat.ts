import {
  decodeIdlAccount as baseDecodeIdlAccount,
  getInstructionTemplate as baseGetInstructionTemplate,
  listIdlProtocols as baseListIdlProtocols,
  sendIdlInstruction as baseSendIdlInstruction,
  simulateIdlInstruction as baseSimulateIdlInstruction,
} from '@brij-digital/apppack-runtime/idlDeclarativeRuntime';

type RegistryProtocol = {
  id?: string;
  idlPath?: string;
  runtimeSpecPath?: string;
};

type RegistryShape = {
  protocols?: RegistryProtocol[];
};

type RuntimeSpecShape = {
  decoderArtifacts?: Record<string, { codecIdlPath?: string; idlPath?: string }>;
};

let augmentedRegistryPromise: Promise<RegistryShape> | null = null;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function isRegistryRequest(input: RequestInfo | URL): boolean {
  const raw = extractRequestUrl(input);
  return raw === '/idl/registry.json' || raw.endsWith('/idl/registry.json');
}

async function parseJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function buildAugmentedRegistry(fetchImpl: typeof fetch): Promise<RegistryShape> {
  if (augmentedRegistryPromise) {
    return augmentedRegistryPromise;
  }

  augmentedRegistryPromise = (async () => {
    const registry = await parseJson<RegistryShape>(await fetchImpl('/idl/registry.json'), 'registry');
    const protocols = Array.isArray(registry.protocols) ? registry.protocols : [];

    const augmentedProtocols = await Promise.all(
      protocols.map(async (protocol) => {
        if (!isObjectRecord(protocol)) {
          return protocol;
        }
        if (typeof protocol.idlPath === 'string' && protocol.idlPath.length > 0) {
          return protocol;
        }
        if (typeof protocol.runtimeSpecPath !== 'string' || protocol.runtimeSpecPath.length === 0) {
          return protocol;
        }

        const runtime = await parseJson<RuntimeSpecShape>(
          await fetchImpl(protocol.runtimeSpecPath),
          `${protocol.id ?? 'unknown'} runtime spec`,
        );
        const candidates = new Set<string>();
        for (const artifact of Object.values(runtime.decoderArtifacts ?? {})) {
          if (typeof artifact.codecIdlPath === 'string' && artifact.codecIdlPath.length > 0) {
            candidates.add(artifact.codecIdlPath);
            continue;
          }
          if (typeof artifact.idlPath === 'string' && artifact.idlPath.length > 0) {
            candidates.add(artifact.idlPath);
          }
        }

        if (candidates.size === 0) {
          return protocol;
        }
        if (candidates.size > 1) {
          throw new Error(`Protocol ${protocol.id ?? 'unknown'} declares multiple codec IDL paths in runtime spec.`);
        }

        return {
          ...protocol,
          idlPath: Array.from(candidates)[0],
        };
      }),
    );

    return {
      ...registry,
      protocols: augmentedProtocols,
    };
  })();

  try {
    return await augmentedRegistryPromise;
  } catch (error) {
    augmentedRegistryPromise = null;
    throw error;
  }
}

async function withAugmentedRegistry<T>(run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (!originalFetch) {
    throw new Error('Global fetch is not available.');
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isRegistryRequest(input)) {
      return originalFetch(input, init);
    }

    const augmentedRegistry = await buildAugmentedRegistry(originalFetch);
    return new Response(JSON.stringify(augmentedRegistry), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export async function listIdlProtocols() {
  return withAugmentedRegistry(() => baseListIdlProtocols());
}

export async function getInstructionTemplate(
  options: Parameters<typeof baseGetInstructionTemplate>[0],
) {
  return withAugmentedRegistry(() => baseGetInstructionTemplate(options));
}

export async function decodeIdlAccount(
  options: Parameters<typeof baseDecodeIdlAccount>[0],
) {
  return withAugmentedRegistry(() => baseDecodeIdlAccount(options));
}

export async function sendIdlInstruction(
  options: Parameters<typeof baseSendIdlInstruction>[0],
) {
  return withAugmentedRegistry(() => baseSendIdlInstruction(options));
}

export async function simulateIdlInstruction(
  options: Parameters<typeof baseSimulateIdlInstruction>[0],
) {
  return withAugmentedRegistry(() => baseSimulateIdlInstruction(options));
}
