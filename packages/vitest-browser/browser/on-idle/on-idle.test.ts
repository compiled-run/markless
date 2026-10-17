import { afterEach, expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import ArmClosed from './idle-arm-closed.tsrx';
import ArmOpen from './idle-arm-open.tsrx';
import IdlePage from './idle-page.tsrx';
import IdleRoot from './idle-root.tsrx';
import IdleRows from './idle-rows.tsrx';

type IdleWindow = typeof globalThis & {
	__idleAnalytics?: string[];
	__idleArmRuns?: number;
};
const host = globalThis as IdleWindow;

// Idle is held by a clock every root inherits, so "not yet idle" is a state the test observes, not a race it hopes to win.
function holdIdle() {
	const queued: Array<() => void> = [];
	Object.defineProperty(Element.prototype, '__mClock', {
		configurable: true,
		get: () => ({
			frame: (run: () => void) => run(),
			idle: (run: () => void) => queued.push(run),
		}),
	});
	return {
		get pending() {
			return queued.length;
		},
		release() {
			for (const run of queued.splice(0)) run();
		},
		restore() {
			delete (Element.prototype as { __mClock?: unknown }).__mClock;
		},
	};
}

let idle: ReturnType<typeof holdIdle> | undefined;
const settle = (ms = 150) => new Promise((done) => setTimeout(done, ms));
const fetched = (name: string) =>
	performance.getEntriesByType('resource').some((entry) => entry.name.includes(name));
const runs = (container: HTMLElement) => container.querySelector('output[data-runs]')?.textContent;
const armRuns = () => host.__idleArmRuns ?? 0;

afterEach(() => {
	idle?.restore();
	idle = undefined;
	delete host.__idleArmRuns;
});

for (const mode of ['csr', 'ssr'] as const) {
	const csr = async (component: Parameters<typeof render>[0]) =>
		(await render(component)).container as unknown as HTMLElement;
	const mount = {
		page: async () => (mode === 'csr' ? csr(IdlePage) : (await renderSSR(IdlePage)).container),
		closed: async () =>
			mode === 'csr' ? csr(ArmClosed) : (await renderSSR(ArmClosed)).container,
		open: async () => (mode === 'csr' ? csr(ArmOpen) : (await renderSSR(ArmOpen)).container),
		rows: async () => (mode === 'csr' ? csr(IdleRows) : (await renderSSR(IdleRows)).container),
		root: async () => (mode === 'csr' ? csr(IdleRoot) : (await renderSSR(IdleRoot)).container),
	};

	test(`${mode}: onIdle runs once after idle with no interaction, and its code loads only then`, async () => {
		idle = holdIdle();
		const container = await mount.page();
		await expect.poll(() => idle!.pending).toBeGreaterThan(0);
		await settle();
		expect(runs(container)).toBe('0');
		// The module cache answers the second mode, so only the first can see the fetch happen.
		const firstFetch = !fetched('idle-analytics');
		if (mode === 'csr') expect(firstFetch).toBe(true);

		await expect
			.poll(() => {
				idle!.release();
				return runs(container);
			})
			.toBe('1');
		const section = container.querySelector('section[data-idle]')!;
		expect(section.getAttribute('data-ready-state')).toBe('complete');
		await expect.poll(() => host.__idleAnalytics?.length ?? 0).toBeGreaterThan(0);
		if (firstFetch) expect(fetched('idle-analytics')).toBe(true);

		for (let round = 0; round < 3; round++) {
			idle.release();
			await settle(50);
		}
		expect(runs(container)).toBe('1');
	});

	test(`${mode}: onIdle inside an @if arm runs once the arm mounts and the page is idle`, async () => {
		idle = holdIdle();
		const container = await mount.closed();
		idle.release();
		await settle();
		expect(armRuns()).toBe(0);

		container.querySelector<HTMLButtonElement>('button[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('p[data-idle]')).not.toBeNull();
		await settle();
		expect(armRuns()).toBe(0);
		await expect
			.poll(() => {
				idle!.release();
				return armRuns();
			})
			.toBe(1);

		container.querySelector<HTMLButtonElement>('button[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('p[data-idle]')).toBeNull();
		container.querySelector<HTMLButtonElement>('button[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('p[data-idle]')).not.toBeNull();
		await expect
			.poll(() => {
				idle!.release();
				return armRuns();
			})
			.toBe(2);
	});

	test(`${mode}: onIdle inside an arm open at first render runs at idle with no interaction`, async () => {
		idle = holdIdle();
		await mount.open();
		await expect.poll(() => idle!.pending).toBeGreaterThan(0);
		await settle();
		expect(armRuns()).toBe(0);
		await expect
			.poll(() => {
				idle!.release();
				return armRuns();
			})
			.toBe(1);
		for (let round = 0; round < 3; round++) {
			idle.release();
			await settle(50);
		}
		expect(armRuns()).toBe(1);
	});

	test(`${mode}: an onIdle element removed before idle never runs its handler`, async () => {
		idle = holdIdle();
		const container = await mount.open();
		expect(container.querySelector('p[data-idle]')).not.toBeNull();
		await expect.poll(() => idle!.pending).toBeGreaterThan(0);

		container.querySelector<HTMLButtonElement>('button[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('p[data-idle]')).toBeNull();
		for (let round = 0; round < 4; round++) {
			idle.release();
			await settle(75);
		}
		expect(armRuns()).toBe(0);
	});

	test(`${mode}: onIdle on @for rows runs for the served rows and again for each row added later`, async () => {
		idle = holdIdle();
		const container = await mount.rows();
		await expect.poll(() => idle!.pending).toBeGreaterThan(0);
		await expect
			.poll(() => {
				idle!.release();
				return armRuns();
			})
			.toBe(1);

		container.querySelector<HTMLButtonElement>('button[data-add]')!.click();
		await expect.poll(() => container.querySelectorAll('li[data-row]').length).toBe(2);
		await settle();
		expect(armRuns()).toBe(1);
		await expect
			.poll(() => {
				idle!.release();
				return armRuns();
			})
			.toBe(2);
	});

	test(`${mode}: onIdle on the component's own root element runs once`, async () => {
		idle = holdIdle();
		await mount.root();
		await expect.poll(() => idle!.pending).toBeGreaterThan(0);
		await expect
			.poll(() => {
				idle!.release();
				return armRuns();
			})
			.toBe(1);
		for (let round = 0; round < 3; round++) {
			idle.release();
			await settle(50);
		}
		expect(armRuns()).toBe(1);
	});
}
