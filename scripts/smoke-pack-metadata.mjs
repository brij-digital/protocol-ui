import fs from 'node:fs/promises';
import path from 'node:path';
import { listAllIndexingSources } from './indexing-registry.mjs';

const ROOT = process.cwd();
const IDL_DIR = path.join(ROOT, 'public', 'idl');
const REGISTRY_PATH = path.join(IDL_DIR, 'registry.json');

function fail(message) {
  throw new Error(message);
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const registry = await loadJson(REGISTRY_PATH);
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.protocols)) {
    fail(`Invalid registry: ${REGISTRY_PATH}`);
  }

  let loadedRuntimePacks = 0;
  for (const protocol of registry.protocols) {
    if (!protocol || typeof protocol !== 'object') {
      fail('Registry contains an invalid protocol entry.');
    }
    if (protocol.appPath !== undefined) {
      fail(`Protocol ${protocol.id ?? 'unknown'} still declares appPath.`);
    }
    const agentRuntimePath = typeof protocol.agentRuntimePath === 'string' ? protocol.agentRuntimePath : null;
    if (!agentRuntimePath) {
      continue;
    }
    if (!agentRuntimePath.startsWith('/idl/')) {
      fail(`Protocol ${protocol.id ?? 'unknown'} has invalid agentRuntimePath.`);
    }
    const agentRuntimeFilePath = path.join(IDL_DIR, agentRuntimePath.slice('/idl/'.length));
    const agentRuntime = await loadJson(agentRuntimeFilePath);
    if (!agentRuntime || typeof agentRuntime !== 'object' || Array.isArray(agentRuntime)) {
      fail(`${agentRuntimeFilePath} did not parse as a JSON object.`);
    }
    if (typeof agentRuntime.protocol_id !== 'string' || agentRuntime.protocol_id.trim() !== protocol.id) {
      fail(`${agentRuntimeFilePath} has invalid protocol_id.`);
    }
    if (typeof agentRuntime.program_id !== 'string' || agentRuntime.program_id.trim().length === 0) {
      fail(`${agentRuntimeFilePath} is missing program_id.`);
    }
    if (typeof agentRuntime.codama_path !== 'string' || !agentRuntime.codama_path.startsWith('/idl/')) {
      fail(`${agentRuntimeFilePath} is missing codama_path.`);
    }
    const hasCapabilities =
      (agentRuntime.views && typeof agentRuntime.views === 'object' && !Array.isArray(agentRuntime.views)) ||
      (agentRuntime.writes && typeof agentRuntime.writes === 'object' && !Array.isArray(agentRuntime.writes));
    if (!hasCapabilities) {
      fail(`${agentRuntimeFilePath} is missing agent runtime capabilities.`);
    }
    loadedRuntimePacks += 1;
    if (!hasCapabilities) {
      fail(`${agentRuntimeFilePath} exposes no usable capabilities.`);
    }
  }

  for (const source of listAllIndexingSources(registry)) {
    if (!source.ingestSpecPath.startsWith('/idl/')) {
      fail(`Indexing source ${source.indexingId}/${source.sourceId} has invalid ingestSpecPath.`);
    }
    const ingestFilePath = path.join(IDL_DIR, source.ingestSpecPath.slice('/idl/'.length));
    const ingest = await loadJson(ingestFilePath);
    if (!ingest || typeof ingest !== 'object' || Array.isArray(ingest)) {
      fail(`${ingestFilePath} did not parse as a JSON object.`);
    }
    if (!ingest.decoderArtifacts || typeof ingest.decoderArtifacts !== 'object' || Array.isArray(ingest.decoderArtifacts)) {
      fail(`${ingestFilePath} is missing ingest decoder artifacts.`);
    }
  }

  console.log(`Wallet runtime pack smoke succeeded for ${loadedRuntimePacks} runtime pack file(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
