// The one source of randomness in the lane: every storm choice comes from a
// generator seeded off the run seed, so CHAOS_SEED replays a run exactly.

/** Mulberry32: 32 bits of state, one multiply-xorshift round, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

export type Rng = {
	/** A fresh number in [0, 1). */
	next(): number;
	/** A whole number in [0, bound). Answers 0 when `bound` is not positive. */
	int(bound: number): number;
	/** A whole number in [low, high], both ends included. */
	between(low: number, high: number): number;
	/** True with probability `odds`. */
	chance(odds: number): boolean;
	/** One item out of a list. Throws on an empty list rather than answering undefined. */
	pick<T>(items: readonly T[]): T;
};

export function rngFrom(seed: number): Rng {
	const next = mulberry32(seed);
	const int = (bound: number) => (bound > 0 ? Math.floor(next() * bound) : 0);
	return {
		next,
		int,
		between: (low, high) => low + int(high - low + 1),
		chance: (odds) => next() < odds,
		pick<T>(items: readonly T[]): T {
			if (items.length === 0) throw new Error('rng.pick was handed an empty list.');
			return items[int(items.length)] as T;
		},
	};
}

function fnv1a(text: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

/**
 * The seed one storm runs on. Derived per storm rather than shared, so adding or
 * reordering a family does not shift the sequence every other storm draws from.
 */
export function stormSeedFor(runSeed: number, label: string): number {
	return (fnv1a(`${runSeed}:${label}`) ^ Math.imul(runSeed >>> 0, 0x9e3779b1)) >>> 0;
}

function seedFromEnvironment(): number | null {
	let raw: string | undefined;
	try {
		raw = __CHAOS_SEED__;
	} catch {
		return null;
	}
	if (raw === undefined || raw.trim() === '') return null;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		throw new Error(`CHAOS_SEED must be a number; got ${JSON.stringify(raw)}.`);
	}
	return parsed >>> 0;
}

export function resolveRunSeed(): number {
	return seedFromEnvironment() ?? Math.floor(Math.random() * 0x100000000) >>> 0;
}

/** The seed this whole run is drawing from. Printed by every failure in the lane. */
export const RUN_SEED: number = resolveRunSeed();

/** The line a failure prints so the reader can replay the exact run. */
export function replayHint(runSeed: number = RUN_SEED): string {
	return `CHAOS_SEED=${runSeed} pnpm exec vitest --config packages/headless/components/chaos/vitest.config.ts`;
}
