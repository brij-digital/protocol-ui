import type { Idl } from '@coral-xyz/anchor';
import type { Connection, PublicKey } from '@solana/web3.js';
import { ORCA_DISCOVER_EXECUTORS } from '../protocols/orca/discoverResolvers';

export type DiscoverStepResolved = {
  name: string;
  discover: string;
  [key: string]: unknown;
};

export type DiscoverRuntimeContext = {
  protocolId: string;
  programId: string;
  connection: Connection;
  walletPublicKey: PublicKey;
  idl: Idl;
  scope: Record<string, unknown>;
};

export type DiscoverExecutor = (step: DiscoverStepResolved, ctx: DiscoverRuntimeContext) => Promise<unknown>;

const discoverHttpCache = new Map<string, { expiresAt: number; value: unknown }>();

function asString(value: unknown, label: string): string {
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`${label} must be a string.`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function asSafeInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  throw new Error(`${label} must be an integer.`);
}

function asFiniteNumber(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`${label} must be a finite number.`);
}

function readPathFromValue(value: unknown, path: string): unknown {
  const cleaned = path.startsWith('$') ? path.slice(1) : path;
  const parts = cleaned.split('.').filter(Boolean);
  let current: unknown = value;

  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function buildUrlWithQuery(url: string, query: Record<string, unknown>): string {
  const entries = Object.entries(query);
  if (entries.length === 0) {
    return url;
  }

  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params.set(key, String(value));
      continue;
    }

    params.set(key, JSON.stringify(value));
  }

  const queryString = params.toString();
  if (!queryString) {
    return url;
  }

  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
}

async function runDiscoverMock(step: DiscoverStepResolved): Promise<unknown> {
  if (step.value === undefined) {
    throw new Error(`discover:${step.name}:value is required for discover.mock.`);
  }
  return step.value;
}

async function runDiscoverQueryHttpJson(step: DiscoverStepResolved): Promise<unknown> {
  const url = asString(step.url, `discover:${step.name}:url`);
  const query = step.query === undefined ? {} : asRecord(step.query, `discover:${step.name}:query`);
  const itemsPath =
    step.items_path === undefined ? undefined : asString(step.items_path, `discover:${step.name}:items_path`);
  const selectPath =
    step.select_path === undefined ? undefined : asString(step.select_path, `discover:${step.name}:select_path`);
  const maxAgeMs =
    step.max_age_ms === undefined ? 0 : asSafeInteger(step.max_age_ms, `discover:${step.name}:max_age_ms`);

  const resolvedUrl = buildUrlWithQuery(url, query);
  const cacheKey = `${step.discover}:${resolvedUrl}:${itemsPath ?? ''}:${selectPath ?? ''}`;
  const now = Date.now();
  const cached = discoverHttpCache.get(cacheKey);
  if (cached && cached.expiresAt >= now) {
    return cached.value;
  }

  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`discover:${step.name}:fetch failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as unknown;
  let result: unknown = body;

  if (itemsPath) {
    result = readPathFromValue(result, itemsPath);
    if (result === undefined) {
      throw new Error(`discover:${step.name}:items_path ${itemsPath} not found.`);
    }
  }

  if (selectPath) {
    result = readPathFromValue(result, selectPath);
    if (result === undefined) {
      throw new Error(`discover:${step.name}:select_path ${selectPath} not found.`);
    }
  }

  if (maxAgeMs > 0) {
    discoverHttpCache.set(cacheKey, {
      expiresAt: now + maxAgeMs,
      value: result,
    });
  }

  return result;
}

async function runDiscoverCompareValues(step: DiscoverStepResolved): Promise<unknown> {
  const items = asArray(step.items, `discover:${step.name}:items`);
  if (items.length === 0) {
    throw new Error(`discover:${step.name}:items must not be empty.`);
  }

  const mode = step.mode === undefined ? 'first' : asString(step.mode, `discover:${step.name}:mode`);
  if (mode === 'first') {
    return items[0];
  }

  const metricPath = asString(step.metric_path, `discover:${step.name}:metric_path`);
  const pickMax = mode === 'max';
  const pickMin = mode === 'min';
  if (!pickMax && !pickMin) {
    throw new Error(`discover:${step.name}:mode must be one of first|max|min.`);
  }

  let selected = items[0];
  let selectedMetric = asFiniteNumber(
    readPathFromValue(selected, metricPath),
    `discover:${step.name}:items[0].${metricPath}`,
  );

  for (let i = 1; i < items.length; i += 1) {
    const itemMetric = asFiniteNumber(
      readPathFromValue(items[i], metricPath),
      `discover:${step.name}:items[${i}].${metricPath}`,
    );
    if ((pickMax && itemMetric > selectedMetric) || (pickMin && itemMetric < selectedMetric)) {
      selected = items[i];
      selectedMetric = itemMetric;
    }
  }

  return selected;
}

async function runDiscoverPickListItem(step: DiscoverStepResolved): Promise<unknown> {
  const items = asArray(step.items, `discover:${step.name}:items`);
  if (items.length === 0) {
    throw new Error(`discover:${step.name}:items must not be empty.`);
  }

  const indexRaw = step.index === undefined ? 0 : asSafeInteger(step.index, `discover:${step.name}:index`);
  if (indexRaw < 0 || indexRaw >= items.length) {
    throw new Error(`discover:${step.name}:index ${indexRaw} is out of bounds for ${items.length} item(s).`);
  }

  return items[indexRaw];
}

const DISCOVER_EXECUTORS: Record<string, DiscoverExecutor> = {
  'discover.mock': runDiscoverMock,
  'discover.query_http_json': runDiscoverQueryHttpJson,
  'discover.compare_values': runDiscoverCompareValues,
  'discover.pick_list_item': runDiscoverPickListItem,
  ...ORCA_DISCOVER_EXECUTORS,
};

export async function runRegisteredDiscoverStep(step: DiscoverStepResolved, ctx: DiscoverRuntimeContext): Promise<unknown> {
  const executor = DISCOVER_EXECUTORS[step.discover];
  if (!executor) {
    throw new Error(`Unsupported discover step: ${step.discover}`);
  }

  return executor(step, ctx);
}
