// A dev transform Markless awaits that never settles hangs every importer silently; past a deadline it fails, naming what was waited on.
import type { MarklessEnvironment } from '../types.ts';

// The longest such transform measured on the website, in dev and in its test run, took under 0.5 s.
export const DEV_TRANSFORM_STALL_MS = 60_000;

export function devTransformStallMs(value = process.env.MARKLESS_DEV_TRANSFORM_STALL_MS): number {
	const parsed = Number(value);
	return value !== undefined && value !== '' && Number.isFinite(parsed) && parsed > 0
		? parsed
		: DEV_TRANSFORM_STALL_MS;
}

export function createDevTransformGuard(stallMs: number) {
	const waiting = new Map<number, string>();
	let nextWait = 0;
	return async function guard<T>(
		url: string,
		environment: MarklessEnvironment,
		work: () => Promise<T> | T,
	): Promise<T> {
		const id = nextWait++;
		const label = `${environment} ${url}`;
		waiting.set(id, label);
		let timer: ReturnType<typeof setTimeout> | undefined;
		const stalled = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				const others = [...waiting]
					.filter(([other]) => other !== id)
					.map(([, other]) => `\n  ${other}`)
					.join('');
				reject(
					new Error(
						`MARKLESS_DEV_TRANSFORM_STALLED: Markless waited ${stallMs} ms for the ${environment} transform of ${JSON.stringify(url)} and it has not finished. A transform that waits, through another request, on one that waits on it never settles.${others ? ` Markless is also waiting on:${others}` : ''} Set MARKLESS_DEV_TRANSFORM_STALL_MS to wait longer on a slow machine.`,
					),
				);
			}, stallMs);
			timer.unref?.();
		});
		try {
			return await Promise.race([Promise.resolve().then(work), stalled]);
		} finally {
			clearTimeout(timer);
			waiting.delete(id);
		}
	};
}
