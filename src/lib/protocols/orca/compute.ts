import {
  swapQuoteByInputToken,
  type OracleFacade,
  type TickArrayFacade,
  type WhirlpoolFacade,
} from '@orca-so/whirlpools-core';
import type { ComputeRuntimeContext, ComputeStepResolved } from '../../metaComputeRegistry';

const ORCA_TICK_ARRAY_SIZE = 88;
const ORCA_MIN_SQRT_PRICE = '4295048016';
const ORCA_MAX_SQRT_PRICE = '79226673515401279992447579055';

// Whirlpool instruction still expects SPL Token program in this MVP.
const DEFAULT_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function asBool(value: unknown, label: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error(`${label} must be boolean.`);
}

function asIntegerString(value: unknown, label: string): string {
  const normalized = typeof value === 'number' || typeof value === 'bigint' ? value.toString() : value;
  if (typeof normalized !== 'string' || !/^-?\d+$/.test(normalized)) {
    throw new Error(`${label} must be an integer string.`);
  }
  return normalized;
}

function asString(value: unknown, label: string): string {
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`${label} must be a string.`);
}

function asU64String(value: unknown, label: string): string {
  const normalized = asIntegerString(value, label);
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be an unsigned integer string.`);
  }
  return normalized;
}

function asSafeInteger(value: unknown, label: string): number {
  const parsed = Number(asIntegerString(value, label));
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return parsed;
}

function asBigInt(value: unknown, label: string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} must be a safe integer.`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new Error(`${label} must be an integer-like value.`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must resolve to an object.`);
  }
  return value as Record<string, unknown>;
}

function getRecordValue(record: Record<string, unknown>, candidates: string[], label: string): unknown {
  for (const candidate of candidates) {
    if (record[candidate] !== undefined) {
      return record[candidate];
    }
  }
  throw new Error(`Missing field ${label}. Expected one of: ${candidates.join(', ')}`);
}

function toWhirlpoolFacade(whirlpoolData: Record<string, unknown>, label: string): WhirlpoolFacade {
  const rewardInfosRaw = getRecordValue(whirlpoolData, ['reward_infos', 'rewardInfos'], 'reward_infos');
  if (!Array.isArray(rewardInfosRaw) || rewardInfosRaw.length !== 3) {
    throw new Error(`${label}:reward_infos must be an array with 3 entries.`);
  }

  const feeTierIndexSeedRaw = getRecordValue(
    whirlpoolData,
    ['fee_tier_index_seed', 'feeTierIndexSeed'],
    'fee_tier_index_seed',
  );
  if (!Array.isArray(feeTierIndexSeedRaw)) {
    throw new Error(`${label}:fee_tier_index_seed must be an array.`);
  }

  return {
    feeTierIndexSeed: Uint8Array.from(
      feeTierIndexSeedRaw.map((entry, index) => asSafeInteger(entry, `${label}:fee_tier_index_seed[${index}]`)),
    ),
    tickSpacing: asSafeInteger(
      getRecordValue(whirlpoolData, ['tick_spacing', 'tickSpacing'], 'tick_spacing'),
      `${label}:tick_spacing`,
    ),
    feeRate: asSafeInteger(getRecordValue(whirlpoolData, ['fee_rate', 'feeRate'], 'fee_rate'), `${label}:fee_rate`),
    protocolFeeRate: asSafeInteger(
      getRecordValue(whirlpoolData, ['protocol_fee_rate', 'protocolFeeRate'], 'protocol_fee_rate'),
      `${label}:protocol_fee_rate`,
    ),
    liquidity: asBigInt(getRecordValue(whirlpoolData, ['liquidity'], 'liquidity'), `${label}:liquidity`),
    sqrtPrice: asBigInt(getRecordValue(whirlpoolData, ['sqrt_price', 'sqrtPrice'], 'sqrt_price'), `${label}:sqrt_price`),
    tickCurrentIndex: asSafeInteger(
      getRecordValue(whirlpoolData, ['tick_current_index', 'tickCurrentIndex'], 'tick_current_index'),
      `${label}:tick_current_index`,
    ),
    feeGrowthGlobalA: asBigInt(
      getRecordValue(whirlpoolData, ['fee_growth_global_a', 'feeGrowthGlobalA'], 'fee_growth_global_a'),
      `${label}:fee_growth_global_a`,
    ),
    feeGrowthGlobalB: asBigInt(
      getRecordValue(whirlpoolData, ['fee_growth_global_b', 'feeGrowthGlobalB'], 'fee_growth_global_b'),
      `${label}:fee_growth_global_b`,
    ),
    rewardLastUpdatedTimestamp: asBigInt(
      getRecordValue(
        whirlpoolData,
        ['reward_last_updated_timestamp', 'rewardLastUpdatedTimestamp'],
        'reward_last_updated_timestamp',
      ),
      `${label}:reward_last_updated_timestamp`,
    ),
    rewardInfos: rewardInfosRaw.map((reward, index) => {
      const rec = asRecord(reward, `${label}:reward_infos[${index}]`);
      return {
        emissionsPerSecondX64: asBigInt(
          getRecordValue(rec, ['emissions_per_second_x64', 'emissionsPerSecondX64'], 'emissions_per_second_x64'),
          `${label}:reward_infos[${index}].emissions_per_second_x64`,
        ),
        growthGlobalX64: asBigInt(
          getRecordValue(rec, ['growth_global_x64', 'growthGlobalX64'], 'growth_global_x64'),
          `${label}:reward_infos[${index}].growth_global_x64`,
        ),
      };
    }),
  };
}

function toOracleFacade(oracleData: Record<string, unknown>, label: string): OracleFacade {
  const constants = asRecord(
    getRecordValue(oracleData, ['adaptive_fee_constants', 'adaptiveFeeConstants'], 'adaptive_fee_constants'),
    `${label}:adaptive_fee_constants`,
  );
  const variables = asRecord(
    getRecordValue(oracleData, ['adaptive_fee_variables', 'adaptiveFeeVariables'], 'adaptive_fee_variables'),
    `${label}:adaptive_fee_variables`,
  );

  return {
    tradeEnableTimestamp: asBigInt(
      getRecordValue(oracleData, ['trade_enable_timestamp', 'tradeEnableTimestamp'], 'trade_enable_timestamp'),
      `${label}:trade_enable_timestamp`,
    ),
    adaptiveFeeConstants: {
      filterPeriod: asSafeInteger(
        getRecordValue(constants, ['filter_period', 'filterPeriod'], 'filter_period'),
        `${label}:adaptive_fee_constants.filter_period`,
      ),
      decayPeriod: asSafeInteger(
        getRecordValue(constants, ['decay_period', 'decayPeriod'], 'decay_period'),
        `${label}:adaptive_fee_constants.decay_period`,
      ),
      reductionFactor: asSafeInteger(
        getRecordValue(constants, ['reduction_factor', 'reductionFactor'], 'reduction_factor'),
        `${label}:adaptive_fee_constants.reduction_factor`,
      ),
      adaptiveFeeControlFactor: asSafeInteger(
        getRecordValue(
          constants,
          ['adaptive_fee_control_factor', 'adaptiveFeeControlFactor'],
          'adaptive_fee_control_factor',
        ),
        `${label}:adaptive_fee_constants.adaptive_fee_control_factor`,
      ),
      maxVolatilityAccumulator: asSafeInteger(
        getRecordValue(constants, ['max_volatility_accumulator', 'maxVolatilityAccumulator'], 'max_volatility_accumulator'),
        `${label}:adaptive_fee_constants.max_volatility_accumulator`,
      ),
      tickGroupSize: asSafeInteger(
        getRecordValue(constants, ['tick_group_size', 'tickGroupSize'], 'tick_group_size'),
        `${label}:adaptive_fee_constants.tick_group_size`,
      ),
      majorSwapThresholdTicks: asSafeInteger(
        getRecordValue(constants, ['major_swap_threshold_ticks', 'majorSwapThresholdTicks'], 'major_swap_threshold_ticks'),
        `${label}:adaptive_fee_constants.major_swap_threshold_ticks`,
      ),
    },
    adaptiveFeeVariables: {
      lastReferenceUpdateTimestamp: asBigInt(
        getRecordValue(
          variables,
          ['last_reference_update_timestamp', 'lastReferenceUpdateTimestamp'],
          'last_reference_update_timestamp',
        ),
        `${label}:adaptive_fee_variables.last_reference_update_timestamp`,
      ),
      lastMajorSwapTimestamp: asBigInt(
        getRecordValue(variables, ['last_major_swap_timestamp', 'lastMajorSwapTimestamp'], 'last_major_swap_timestamp'),
        `${label}:adaptive_fee_variables.last_major_swap_timestamp`,
      ),
      volatilityReference: asSafeInteger(
        getRecordValue(variables, ['volatility_reference', 'volatilityReference'], 'volatility_reference'),
        `${label}:adaptive_fee_variables.volatility_reference`,
      ),
      tickGroupIndexReference: asSafeInteger(
        getRecordValue(variables, ['tick_group_index_reference', 'tickGroupIndexReference'], 'tick_group_index_reference'),
        `${label}:adaptive_fee_variables.tick_group_index_reference`,
      ),
      volatilityAccumulator: asSafeInteger(
        getRecordValue(variables, ['volatility_accumulator', 'volatilityAccumulator'], 'volatility_accumulator'),
        `${label}:adaptive_fee_variables.volatility_accumulator`,
      ),
    },
  };
}

function toTickArrayFacade(tickArray: Record<string, unknown>, label: string): TickArrayFacade {
  const ticksRaw = getRecordValue(tickArray, ['ticks'], 'ticks');
  if (!Array.isArray(ticksRaw) || ticksRaw.length !== ORCA_TICK_ARRAY_SIZE) {
    throw new Error(`${label}:ticks must be an array of ${ORCA_TICK_ARRAY_SIZE}.`);
  }

  return {
    startTickIndex: asSafeInteger(
      getRecordValue(tickArray, ['start_tick_index', 'startTickIndex'], 'start_tick_index'),
      `${label}:start_tick_index`,
    ),
    ticks: ticksRaw.map((tick, index) => {
      const rec = asRecord(tick, `${label}:ticks[${index}]`);
      const rewardGrowthsOutside = getRecordValue(
        rec,
        ['reward_growths_outside', 'rewardGrowthsOutside'],
        'reward_growths_outside',
      );
      if (!Array.isArray(rewardGrowthsOutside) || rewardGrowthsOutside.length !== 3) {
        throw new Error(`${label}:ticks[${index}].reward_growths_outside must contain 3 entries.`);
      }

      return {
        initialized: asBool(getRecordValue(rec, ['initialized'], 'initialized'), `${label}:ticks[${index}].initialized`),
        liquidityNet: asBigInt(
          getRecordValue(rec, ['liquidity_net', 'liquidityNet'], 'liquidity_net'),
          `${label}:ticks[${index}].liquidity_net`,
        ),
        liquidityGross: asBigInt(
          getRecordValue(rec, ['liquidity_gross', 'liquidityGross'], 'liquidity_gross'),
          `${label}:ticks[${index}].liquidity_gross`,
        ),
        feeGrowthOutsideA: asBigInt(
          getRecordValue(rec, ['fee_growth_outside_a', 'feeGrowthOutsideA'], 'fee_growth_outside_a'),
          `${label}:ticks[${index}].fee_growth_outside_a`,
        ),
        feeGrowthOutsideB: asBigInt(
          getRecordValue(rec, ['fee_growth_outside_b', 'feeGrowthOutsideB'], 'fee_growth_outside_b'),
          `${label}:ticks[${index}].fee_growth_outside_b`,
        ),
        rewardGrowthsOutside: rewardGrowthsOutside.map((entry, rewardIndex) =>
          asBigInt(entry, `${label}:ticks[${index}].reward_growths_outside[${rewardIndex}]`),
        ),
      };
    }),
  };
}

export async function runOrcaSwapQuoteCompute(step: ComputeStepResolved, _ctx: ComputeRuntimeContext): Promise<unknown> {
  void _ctx;
  const amount = asU64String(step.amount, `compute.orca_swap_quote:${step.name}:amount`);
  const aToB = asBool(step.a_to_b, `compute.orca_swap_quote:${step.name}:a_to_b`);
  const slippageBps = Number(asU64String(step.slippage_bps, `compute.orca_swap_quote:${step.name}:slippage_bps`));
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new Error(`compute.orca_swap_quote:${step.name}:slippage_bps must be an integer between 0 and 10000.`);
  }

  const quoteData = asRecord(step.quote_data, `compute.orca_swap_quote:${step.name}:quote_data`);
  const whirlpoolData = asRecord(quoteData.whirlpool, `compute.orca_swap_quote:${step.name}:quote_data.whirlpool`);
  const whirlpool = toWhirlpoolFacade(whirlpoolData, `compute.orca_swap_quote:${step.name}:whirlpool`);

  let oracle: OracleFacade | undefined;
  if (quoteData.oracle !== undefined && quoteData.oracle !== null) {
    const oracleData = asRecord(quoteData.oracle, `compute.orca_swap_quote:${step.name}:quote_data.oracle`);
    oracle = toOracleFacade(oracleData, `compute.orca_swap_quote:${step.name}:oracle`);
  }

  const resolvedAtUnixTs =
    quoteData.resolved_at_unix_ts !== undefined
      ? asSafeInteger(quoteData.resolved_at_unix_ts, `compute.orca_swap_quote:${step.name}:quote_data.resolved_at_unix_ts`)
      : Math.floor(Date.now() / 1000);

  const candidatesRaw = quoteData.candidates;
  if (!Array.isArray(candidatesRaw) || candidatesRaw.length === 0) {
    throw new Error(`compute.orca_swap_quote:${step.name}:quote_data.candidates must be a non-empty array.`);
  }

  const computeErrors: string[] = [];

  for (let candidateIndex = 0; candidateIndex < candidatesRaw.length; candidateIndex += 1) {
    const candidate = asRecord(candidatesRaw[candidateIndex], `compute.orca_swap_quote:${step.name}:candidates[${candidateIndex}]`);
    const tickArray0 = asString(
      candidate.tickArray0,
      `compute.orca_swap_quote:${step.name}:candidate[${candidateIndex}].tickArray0`,
    );
    const tickArray1 = asString(
      candidate.tickArray1,
      `compute.orca_swap_quote:${step.name}:candidate[${candidateIndex}].tickArray1`,
    );
    const tickArray2 = asString(
      candidate.tickArray2,
      `compute.orca_swap_quote:${step.name}:candidate[${candidateIndex}].tickArray2`,
    );

    const tickArraysRaw = candidate.tick_arrays;
    if (!Array.isArray(tickArraysRaw) || tickArraysRaw.length !== 3) {
      throw new Error(`compute.orca_swap_quote:${step.name}:candidate[${candidateIndex}].tick_arrays must have 3 entries.`);
    }

    const tickArrays = tickArraysRaw.map((entry, index) =>
      toTickArrayFacade(
        asRecord(entry, `compute.orca_swap_quote:${step.name}:candidate[${candidateIndex}].tick_arrays[${index}]`),
        `compute.orca_swap_quote:${step.name}:candidate[${candidateIndex}].tick_arrays[${index}]`,
      ),
    );

    try {
      const quote = swapQuoteByInputToken(
        BigInt(amount),
        aToB,
        slippageBps,
        whirlpool,
        oracle,
        tickArrays,
        BigInt(resolvedAtUnixTs),
      );

      return {
        tickArray0,
        tickArray1,
        tickArray2,
        sqrtPriceLimit: aToB ? ORCA_MIN_SQRT_PRICE : ORCA_MAX_SQRT_PRICE,
        otherAmountThreshold: quote.tokenMinOut.toString(),
        estimatedAmountIn: quote.tokenIn.toString(),
        estimatedAmountOut: quote.tokenEstOut.toString(),
        tokenProgram: DEFAULT_TOKEN_PROGRAM,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      computeErrors.push(`candidate ${candidateIndex} (${tickArray0}|${tickArray1}|${tickArray2}) => ${message}`);
    }
  }

  throw new Error(
    `compute.orca_swap_quote:${step.name}: quote math failed for all candidates. ${computeErrors.slice(0, 5).join(' | ')}`,
  );
}
