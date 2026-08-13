import { ApiError } from "../contracts";

/**
 * Simulated transport for the development mock API.
 * Latency and injectable failures let us review loading / error states
 * intentionally. Replaced wholesale by the REST client in a later phase.
 */

export interface TransportConfig {
  /** min/max simulated round-trip in ms */
  minLatencyMs: number;
  maxLatencyMs: number;
  /** 0..1 probability that any read fails */
  readFailureRate: number;
  /** 0..1 probability that any mutation fails */
  writeFailureRate: number;
  /** force the next call of a given key to fail (dev tooling) */
  forcedFailures: Set<string>;
}

export const transportConfig: TransportConfig = {
  minLatencyMs: 140,
  maxLatencyMs: 420,
  readFailureRate: 0,
  writeFailureRate: 0,
  forcedFailures: new Set<string>(),
};

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function simulate(key: string, failureRate: number) {
  const { minLatencyMs, maxLatencyMs, forcedFailures } = transportConfig;
  await delay(minLatencyMs + Math.random() * (maxLatencyMs - minLatencyMs));
  if (forcedFailures.has(key)) {
    forcedFailures.delete(key);
    throw new ApiError(`Simulated failure for "${key}"`, 503);
  }
  if (failureRate > 0 && Math.random() < failureRate) {
    throw new ApiError(`Upstream unavailable while handling "${key}"`, 503);
  }
}

export async function read<T>(key: string, fn: () => T): Promise<T> {
  await simulate(key, transportConfig.readFailureRate);
  return fn();
}

export async function write<T>(key: string, fn: () => T): Promise<T> {
  await simulate(key, transportConfig.writeFailureRate);
  return fn();
}

/** Dev helper used by the settings screen to demonstrate error states. */
export function failNextCall(key: string) {
  transportConfig.forcedFailures.add(key);
}

export function setFailureRates(read: number, write: number) {
  transportConfig.readFailureRate = read;
  transportConfig.writeFailureRate = write;
}
