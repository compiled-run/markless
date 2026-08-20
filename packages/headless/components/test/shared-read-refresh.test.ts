import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import BranchApp from './fixtures/shared-branch-resume-page.tsrx';
import CompositeApp from './fixtures/shared-composite-refresh.tsrx';
import LocalComputedApp from './fixtures/shared-local-computed.tsrx';
import StatesApp from './fixtures/checkbox-states.tsrx';

// Three red witnesses for the compiler defects the checkbox family ran into.
// Each is marked `test.fails`, so the day the defect is fixed THIS file turns
// red and tells whoever fixed it to unmark the test and un-block the parity
// rows in goals/headless-components/notes/parity-table.md. The pattern follows
// packages/vitest-browser/browser/constructs-csr.test.ts, which carried a
// test.fails until T006 made it pass.
afterEach(() => cleanup());

// U-D. Only a plain path read of a shared field follows a write. A ternary over
// the same field, and a computed() built in the shared factory, both keep the
// value they first rendered — so `aria-checked`, `ui-checked` and `ui-mixed`
// cannot follow a toggle.
test.fails('a composite expression over a shared read follows the write', async () => {
	const screen = await render(CompositeApp);
	const container = screen.container as HTMLElement;
	const trigger = container.querySelector('[data-repro-trigger]') as HTMLButtonElement;

	expect(trigger.getAttribute('data-attr')).toBe('false');
	trigger.click();
	await expect.poll(() => trigger.getAttribute('data-raw')).toBe('true');
	expect({
		attr: trigger.getAttribute('data-attr'),
		derived: trigger.getAttribute('data-derived'),
		text: container.querySelector('[data-repro-text]')?.textContent,
		rawText: container.querySelector('[data-repro-raw]')?.textContent,
	}).toEqual({ attr: 'true', derived: 'true', text: 'true', rawText: 'true' });
});

// U-E. A computed() declared in a component body that reads a shared instance
// throws `ReferenceError: <factory local> is not defined` out of the prerender
// evaluator: the emitted residue reader closes over the factory's own local.
test.fails('a component-local computed over a shared read renders', async () => {
	const screen = await render(LocalComputedApp);
	expect((screen.container as HTMLElement).querySelector('[data-local-computed]')?.textContent).toBe(
		'false',
	);
});

// U-F. After an SSR resume the write lands — `data-raw` follows it — but a
// branch whose condition reads the same shared field never re-renders. The same
// fixture flips correctly under CSR, which is what makes this resume-only.
test('CSR: a branch over a shared read re-renders after the write', async () => {
	const screen = await render(BranchApp);
	const container = screen.container as HTMLElement;
	container.querySelector<HTMLButtonElement>('[data-gate-trigger]')?.click();
	await expect.poll(() => container.querySelector('[data-gate-arm]')?.textContent).toBe('open');
});

test.fails('SSR: a branch over a shared read re-renders after resume', async () => {
	const screen = await renderSSR(BranchApp);
	const container = screen.container;
	container.querySelector<HTMLButtonElement>('[data-gate-trigger]')?.click();
	// The write itself arrives, which is what makes this a render defect.
	await expect.poll(() => container.querySelector('[data-gate-trigger]')?.getAttribute('data-raw')).toBe('true');
	await expect.poll(() => container.querySelector('[data-gate-arm]')?.textContent).toBe('open');
});

// U-G. Two unmatched-dispatch errors escape as unhandled rejections during an
// ordinary interaction sequence: a click on a <label> that only names a trigger
// has no record of its own, and a container from an earlier SSR render still
// answers document-level events after cleanup(). Neither breaks a behaviour —
// the label still toggles the checkbox — but a consumer cannot silence either.
test.fails('an ordinary interaction sequence raises no unmatched-dispatch rejection', async () => {
	const seen: string[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		event.preventDefault();
		seen.push(String(event.reason));
	};
	window.addEventListener('unhandledrejection', onRejection);
	try {
		// An SSR container first, cleaned up before the next render.
		await renderSSR(StatesApp);
		await cleanup();

		const screen = await render(StatesApp);
		const host = (screen.container as HTMLElement).querySelector('[data-case="plain"]');
		host?.querySelector('label')?.click();
		host?.querySelector('button')?.click();
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(seen).toEqual([]);
	} finally {
		window.removeEventListener('unhandledrejection', onRejection);
	}
});
