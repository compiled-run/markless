import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import BranchApp from './fixtures/shared-branch-resume-page.tsrx';
import CompositeApp from './fixtures/shared-composite-refresh.tsrx';
import LocalComputedApp from './fixtures/shared-local-computed.tsrx';
import StatesApp from './fixtures/checkbox-states.tsrx';

// Witnesses for the compiler defects the checkbox family ran into. A defect
// still live is marked `test.fails`, so the day it is fixed THIS file turns red
// and tells whoever fixed it to unmark the test and un-block the parity rows in
// goals/headless-components/notes/parity-table.md. U-D, U-E, U-F and U-G are all
// fixed and their witnesses are plain green tests now.
afterEach(() => cleanup());

// U-D (fixed). A ternary over a shared field, and a computed() built in the
// shared factory, used to keep the value they first rendered, so `aria-checked`,
// `ui-checked` and `ui-mixed` could not follow a toggle. Each recombined
// expression now stands behind a synthetic computed subscribed to the cells it
// reads.
async function expectCompositeFollowsWrite(container: ParentNode) {
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
}

test('CSR: a composite expression over a shared read follows the write', async () => {
	const screen = await render(CompositeApp);
	await expectCompositeFollowsWrite(screen.container as HTMLElement);
});

test('SSR: a composite expression over a shared read follows the write after resume', async () => {
	const screen = await renderSSR(CompositeApp);
	await expectCompositeFollowsWrite(screen.container);
});

// U-E (fixed). A computed() declared in a component body that reads a shared
// instance used to throw `ReferenceError: <factory local> is not defined` out of
// the prerender evaluator, because its dependency never resolved and its derive
// kept the authored read.
test('CSR: a component-local computed over a shared read renders', async () => {
	const screen = await render(LocalComputedApp);
	expect((screen.container as HTMLElement).querySelector('[data-local-computed]')?.textContent).toBe(
		'false',
	);
});

test('SSR: a component-local computed over a shared read renders', async () => {
	const screen = await renderSSR(LocalComputedApp);
	expect(screen.container.querySelector('[data-local-computed]')?.textContent).toBe('false');
});

// U-F (fixed). The branch lives in a PROJECTED part, and its arm holds the
// children the page projected into it. Two things used to stop it after a
// resume: a same-module component's SSR render dropped every branch record it
// had just anchored, so the flip was never wired; and the arm rebuild reads the
// projected children back out of the component's own prop cell, which only a
// CSR mount seeded. The write always landed — `data-raw` followed it — which is
// what made this a render defect rather than a state one.
async function expectGateOpens(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-gate-trigger]')?.click();
	await expect
		.poll(() => container.querySelector('[data-gate-trigger]')?.getAttribute('data-raw'))
		.toBe('true');
	await expect.poll(() => container.querySelector('[data-gate-arm]')?.textContent).toBe('open');
}

test('CSR: a branch over a shared read re-renders after the write', async () => {
	const screen = await render(BranchApp);
	await expectGateOpens(screen.container as HTMLElement);
});

test('SSR: a branch over a shared read re-renders after resume', async () => {
	const screen = await renderSSR(BranchApp);
	await expectGateOpens(screen.container);
});

// U-G (fixed). Unmatched-dispatch errors used to escape as unhandled rejections
// during an ordinary interaction sequence: a click on a <label> that only names
// a trigger has no record of its own, and a container from an earlier SSR render
// still answered document-level events after cleanup(). Neither broke a
// behaviour — the label still toggles the checkbox — and neither could be
// silenced. A container listener now passes a record-free element through, and
// whatever it does catch reports instead of rejecting into the void.
test('an ordinary interaction sequence raises no unmatched-dispatch rejection', async () => {
	const seen: string[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		event.preventDefault();
		seen.push(String(event.reason));
	};
	const onError = (event: ErrorEvent) => void seen.push(String(event.error ?? event.message));
	window.addEventListener('unhandledrejection', onRejection);
	window.addEventListener('error', onError);
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
		window.removeEventListener('error', onError);
	}
});
