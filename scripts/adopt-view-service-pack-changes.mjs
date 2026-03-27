import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const VIEW_SERVICE_DIR = process.env.APPPACK_VIEW_SERVICE_DIR?.trim()
  ? path.resolve(process.env.APPPACK_VIEW_SERVICE_DIR.trim())
  : path.resolve(ROOT, '../apppack-view-service');
const VIEW_SERVICE_IDL_DIR = path.join(VIEW_SERVICE_DIR, 'idl');
const WALLET_IDL_DIR = path.join(ROOT, 'public', 'idl');
const AIDL_DIR = path.join(ROOT, 'aidl');

function fail(message) {
  throw new Error(message);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function adoptAidlBackedPack(protocolBaseName) {
  const aidlPath = path.join(AIDL_DIR, `${protocolBaseName}.aidl.json`);
  const serviceCorePath = path.join(VIEW_SERVICE_IDL_DIR, `${protocolBaseName}.meta.core.json`);

  const [aidlSource, serviceCore] = await Promise.all([
    readJson(aidlPath),
    readJson(serviceCorePath),
  ]);

  const next = {
    ...aidlSource,
    label: serviceCore.label ?? aidlSource.label,
    ...(serviceCore.sources ? { sources: serviceCore.sources } : {}),
    templates: serviceCore.templates ?? aidlSource.templates,
    operations: serviceCore.operations ?? aidlSource.operations,
  };

  await writeJson(aidlPath, next);
}

async function adoptMetaBackedPack(protocolBaseName) {
  const walletMetaPath = path.join(WALLET_IDL_DIR, `${protocolBaseName}.meta.json`);
  const serviceCorePath = path.join(VIEW_SERVICE_IDL_DIR, `${protocolBaseName}.meta.core.json`);

  const [walletMeta, serviceCore] = await Promise.all([
    readJson(walletMetaPath),
    readJson(serviceCorePath),
  ]);

  const next = {
    ...walletMeta,
    $schema: '/idl/meta_idl.schema.v0.6.json',
    schema: 'meta-idl.v0.6',
    label: serviceCore.label ?? walletMeta.label,
    ...(serviceCore.sources ? { sources: serviceCore.sources } : {}),
    templates: serviceCore.templates ?? walletMeta.templates,
    operations: serviceCore.operations ?? walletMeta.operations,
  };

  await writeJson(walletMetaPath, next);
}

async function main() {
  await fs.access(VIEW_SERVICE_IDL_DIR).catch(() => fail(`View-service idl directory not found: ${VIEW_SERVICE_IDL_DIR}`));

  await adoptAidlBackedPack('pump_amm');
  await adoptAidlBackedPack('orca_whirlpool');
  await adoptMetaBackedPack('pump_core');

  console.log(`Adopted view-service pack changes from ${VIEW_SERVICE_IDL_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
