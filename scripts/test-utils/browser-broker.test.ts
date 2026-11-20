import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
	BROWSER_BROKER_ENV,
	startBrowserBroker,
	type BrowserLease,
	type BrowserRequest,
	type LaunchServer,
} from './browser-broker.ts';

const IDLE_MS = 1_000;

type FakeServer = { endpoint: string; killed: boolean; crash(): void };
let launched: FakeServer[];
let stop: () => Promise<void>;

const launch: LaunchServer = async (type, options) => {
	const onClose: Array<() => void> = [];
	const server: FakeServer = {
		endpoint: `ws://${type}/${launched.length}/${JSON.stringify(options ?? {})}`,
		killed: false,
		crash: () => onClose.forEach((listener) => listener()),
	};
	launched.push(server);
	return {
		wsEndpoint: () => server.endpoint,
		kill: async () => {
			server.killed = true;
		},
		on(event: string, listener: () => void) {
			if (event === 'close') onClose.push(listener);
			return this;
		},
	} as Awaited<ReturnType<LaunchServer>>;
};

const broker = () => process.env[BROWSER_BROKER_ENV]!;
const lease = async (request: BrowserRequest = { type: 'chromium' }): Promise<BrowserLease> =>
	(await fetch(broker(), { method: 'POST', body: JSON.stringify(request) })).json();
const release = (id: string) => fetch(`${broker()}/release`, { method: 'POST', body: id });
// Lets the kill a fired idle timer queued run before the test reads it.
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	launched = [];
	stop = await startBrowserBroker(launch, IDLE_MS);
});

afterEach(async () => {
	await stop();
	vi.useRealTimers();
});

test('leases taken at the same time share one browser', async () => {
	const [first, second] = await Promise.all([lease(), lease()]);
	expect(launched).toHaveLength(1);
	expect(first.wsEndpoint).toBe(second.wsEndpoint);
	expect(first.lease).not.toBe(second.lease);
});

test('a browser stays open while any lease is held, and closes once idle for the delay', async () => {
	const first = await lease();
	const second = await lease();
	await release(first.lease);
	vi.advanceTimersByTime(IDLE_MS);
	await settle();
	expect(launched[0]!.killed).toBe(false);

	await release(second.lease);
	vi.advanceTimersByTime(IDLE_MS - 1);
	await settle();
	expect(launched[0]!.killed).toBe(false);
	vi.advanceTimersByTime(1);
	await settle();
	expect(launched[0]!.killed).toBe(true);

	await lease();
	expect(launched).toHaveLength(2);
});

test('a lease taken while the browser is idle keeps it open', async () => {
	await release((await lease()).lease);
	vi.advanceTimersByTime(IDLE_MS - 1);
	const again = await lease();
	vi.advanceTimersByTime(IDLE_MS);
	await settle();
	expect(launched).toHaveLength(1);
	expect(launched[0]!.killed).toBe(false);
	expect(again.wsEndpoint).toBe(launched[0]!.endpoint);
});

test('each browser type and set of launch options gets its own browser', async () => {
	await lease({ type: 'chromium' });
	await lease({ type: 'webkit' });
	await lease({ type: 'chromium', options: { channel: 'chromium' } });
	await lease({ type: 'chromium' });
	expect(launched.map((server) => server.endpoint)).toEqual([
		'ws://chromium/0/{}',
		'ws://webkit/1/{}',
		'ws://chromium/2/{"channel":"chromium"}',
	]);
});

test('a browser that exits on its own is launched again for the next lease', async () => {
	await lease();
	launched[0]!.crash();
	await lease();
	expect(launched).toHaveLength(2);
});

test('releasing a lease twice, or one never given, is refused', async () => {
	const { lease: id } = await lease();
	expect((await release(id)).status).toBe(200);
	expect((await release(id)).status).toBe(500);
	expect((await release('never-given')).status).toBe(500);
});

test('stopping the broker kills every browser it holds and withdraws its address', async () => {
	await lease({ type: 'chromium' });
	await release((await lease({ type: 'webkit' })).lease);
	await stop();
	expect(launched.map((server) => server.killed)).toEqual([true, true]);
	expect(process.env[BROWSER_BROKER_ENV]).toBeUndefined();
	stop = async () => {};
});
