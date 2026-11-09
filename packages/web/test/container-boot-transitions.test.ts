import { afterEach, expect, test, vi } from 'vitest';
import {
	ABANDONED,
	BOOTING,
	type ContainerBoot,
	DISPOSE,
	DISPOSED,
	getAlreadyResumedPayload,
	getRetiredResumedPayload,
	GO_LIVE,
	LIVE,
	nextBoot,
	readBoot,
	SETTLE,
	UNWOKEN,
	WAKE,
	wakeNoopResume,
} from '../src/payload-resume-registry.ts';

afterEach(() => {
	vi.unstubAllEnvs();
});

const pending = () => new Promise<never>(() => {});
const result = (name: string) => ({ name, runtime: { dispatch: () => 'live' } }) as never;

function booting(life: object, previous?: ContainerBoot['r']) {
	const boot: ContainerBoot = { p: previous ? DISPOSED : UNWOKEN, r: previous };
	const start = pending();
	nextBoot(boot, WAKE, life, start);
	return { boot, start };
}

function live(life = {}) {
	const { boot, start } = booting(life);
	nextBoot(boot, GO_LIVE, life, result('live'));
	return { boot, start, life };
}

test('unwoken: a wake starts booting for that page lifetime', () => {
	const boot: ContainerBoot = {};
	const life = {};
	const start = pending();
	expect(nextBoot(boot, WAKE, life, start)).toBeUndefined();
	expect(boot).toEqual({ p: BOOTING, l: life, s: start });
});

test('booting: a wake for the same lifetime is not a move, callers join the start already running', () => {
	const life = {};
	const { boot } = booting(life);
	expect(() => nextBoot(boot, WAKE, life, pending())).toThrow('Container boot cannot wake');
});

test('booting: the start settling with the live result filed goes live', () => {
	const { boot } = booting({});
	const filed = result('live');
	expect(nextBoot(boot, GO_LIVE, undefined, filed)).toBe(BOOTING);
	expect(boot.p).toBe(LIVE);
	expect(boot.r).toBe(filed);
});

test('booting: the start settling after the page lifetime changed abandons the boot', () => {
	const { boot, start } = booting({});
	nextBoot(boot, SETTLE, {}, start);
	expect(boot.p).toBe(ABANDONED);
	expect(boot.r).toBeUndefined();
});

test('booting: the start throwing on the current page returns to unwoken so the next wake boots again', () => {
	const life = {};
	const { boot, start } = booting(life);
	nextBoot(boot, SETTLE, life, start);
	expect(boot.p).toBe(UNWOKEN);
});

test('booting: a re-boot from disposed that throws on the current page returns to disposed', () => {
	const life = {};
	const disposed = result('disposed');
	const { boot, start } = booting(life, disposed);
	nextBoot(boot, SETTLE, life, start);
	expect(boot.p).toBe(DISPOSED);
	expect(boot.r).toBe(disposed);
});

test('booting: a retire mid-boot changes nothing until the start settles on a swapped page, which abandons it', () => {
	const { boot, start } = booting({});
	expect(nextBoot(boot, DISPOSE)).toBe(BOOTING);
	expect(boot.p).toBe(BOOTING);
	nextBoot(boot, SETTLE, {}, start);
	expect(boot.p).toBe(ABANDONED);
});

test('booting: a start the record moved past settles without touching it', () => {
	const { boot, start } = booting({});
	const fresh = {};
	const next = pending();
	nextBoot(boot, WAKE, fresh, next);
	nextBoot(boot, SETTLE, {}, start);
	expect(boot).toMatchObject({ p: BOOTING, l: fresh, s: next });
});

test('live: its own start settling afterwards leaves it live', () => {
	const { boot, start, life } = live();
	nextBoot(boot, SETTLE, life, start);
	expect(boot.p).toBe(LIVE);
});

test('live: dispose or retire files the live result as disposed', () => {
	const { boot } = live();
	const filed = boot.r;
	expect(nextBoot(boot, DISPOSE)).toBe(LIVE);
	expect(boot.p).toBe(DISPOSED);
	expect(boot.r).toBe(filed);
});

test('disposed: a wake re-boots and carries the disposed result until the new one goes live', () => {
	const disposed = result('disposed');
	const { boot } = booting({}, disposed);
	expect(boot.p).toBe(BOOTING);
	expect(boot.r).toBe(disposed);
	const filed = result('live');
	nextBoot(boot, GO_LIVE, undefined, filed);
	expect(boot.r).toBe(filed);
});

test('disposed, abandoned and unwoken: dispose again changes nothing', () => {
	for (const phase of [DISPOSED, ABANDONED, UNWOKEN, undefined] as const) {
		const boot: ContainerBoot = { p: phase, r: result('disposed') };
		expect(nextBoot(boot, DISPOSE)).toBe(phase);
		expect(boot.p).toBe(phase);
	}
});

test('any: a wake for a new page lifetime starts a fresh boot', () => {
	for (const boot of [booting({}).boot, { p: ABANDONED } as ContainerBoot]) {
		const fresh = {};
		const start = pending();
		nextBoot(boot, WAKE, fresh, start);
		expect(boot).toMatchObject({ p: BOOTING, l: fresh, s: start });
	}
});

test('illegal in development: a wake on a live root', () => {
	expect(() => nextBoot(live().boot, WAKE, {}, pending())).toThrow('Container boot cannot wake');
});

test('illegal in development: going live from any phase but booting', () => {
	for (const phase of [undefined, UNWOKEN, LIVE, DISPOSED, ABANDONED] as const)
		expect(() => nextBoot({ p: phase }, GO_LIVE, undefined, result('late'))).toThrow(
			'Container boot cannot go live',
		);
});

test('illegal: a start settling in unwoken, live or disposed changes nothing', () => {
	const start = pending();
	for (const phase of [undefined, UNWOKEN, LIVE, DISPOSED] as const) {
		const boot: ContainerBoot = { p: phase, s: start };
		nextBoot(boot, SETTLE, {}, start);
		expect(boot.p).toBe(phase);
	}
});

test('production keeps the old filing: going live from any phase files the result, and a live root can re-boot', () => {
	vi.stubEnv('DEV', false);
	const boot: ContainerBoot = {};
	const late = result('late');
	nextBoot(boot, GO_LIVE, undefined, late);
	expect(boot).toEqual({ p: LIVE, r: late });
	nextBoot(boot, WAKE, {}, pending());
	expect(boot.p).toBe(BOOTING);
});

test('derived: a disposed root out of the document is retired, answering with a no-op dispatch', async () => {
	const root = { isConnected: true };
	const boot = readBoot(root);
	nextBoot(boot, WAKE, {}, pending());
	nextBoot(boot, GO_LIVE, undefined, result('live'));
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(
		(boot.r as unknown as { runtime: unknown }).runtime,
	);
	nextBoot(boot, DISPOSE);
	expect(getRetiredResumedPayload(root as never)).toBeUndefined();
	root.isConnected = false;
	const retired = getRetiredResumedPayload(root as never);
	expect((retired as unknown as { name: string }).name).toBe('live');
	await expect(retired?.runtime.dispatch({} as never)).resolves.toBeUndefined();
});

test('derived: a root out of the document that a wake claimed but never filed was torn down mid-boot', () => {
	const root = { isConnected: false, __asyncResumeRuntimeStarted: true };
	nextBoot(readBoot(root), WAKE, {}, pending());
	expect(getRetiredResumedPayload(root as never)).toBe(wakeNoopResume);
	root.__asyncResumeRuntimeStarted = false;
	expect(getRetiredResumedPayload(root as never)).toBeUndefined();
});

test('each root has one record, created unwoken (no phase) on first read', () => {
	const root = {};
	const boot = readBoot(root);
	expect(boot).toEqual({});
	expect(readBoot(root)).toBe(boot);
	expect(readBoot({})).not.toBe(boot);
});
