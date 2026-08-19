import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import SharedSessionPage from './fixtures/shared-session-page.tsrx';
import SharedTwoDefinitionsPage from './fixtures/shared-two-definitions-page.tsrx';

afterEach(() => cleanup());

type StatePayload = {
	readonly cells: ReadonlyArray<{ readonly graphNodeId: string }>;
	readonly computed: ReadonlyArray<{ readonly graphNodeId: string }>;
};

function statePayloadIds(container: ParentNode): string[] {
	const script = container.querySelector<HTMLScriptElement>('script[type="markless/state"]');
	if (!script) throw new Error('Expected markless/state payload script.');
	const payload = JSON.parse(script.textContent ?? 'null') as StatePayload;
	return [...payload.cells, ...payload.computed].map((node) => node.graphNodeId);
}

// The harness compiles fixtures under their absolute path, so the definition id
// is normalised to its file basename before comparison.
function sharedNodeIds(container: ParentNode): string[] {
	return statePayloadIds(container)
		.filter((id) => id.startsWith('shared:'))
		.map((id) => id.replace(/^shared:.*\/([^/]+\.tsrx#)/, 'shared:$1'));
}

function required<T extends Element>(root: ParentNode, selector: string): T {
	const found = root.querySelector<T>(selector);
	if (!found) throw new Error(`Expected ${selector}.`);
	return found;
}

function text(root: ParentNode, selector: string): string | null {
	return required(root, selector).textContent;
}

test('CSR: one shared instance repaints both reading components on a shared write', async () => {
	const screen = await render(SharedSessionPage);
	const container = screen.container as HTMLElement;

	expect(text(container, '[data-status]')).toBe('anonymous');
	expect(text(container, '[data-user]')).toBe('none');
	expect(text(container, '[data-signed-in]')).toBe('false');

	required<HTMLButtonElement>(container, 'button[data-login]').click();

	await expect.poll(() => text(container, '[data-status]')).toBe('ready');
	expect(text(container, '[data-user]')).toBe('ada');
	expect(text(container, '[data-signed-in]')).toBe('true');
});

test('SSR resume: the payload carries the shared definition cells and the click updates both', async () => {
	const screen = await renderSSR(SharedSessionPage);
	const container = screen.container;

	expect(sharedNodeIds(container)).toEqual([
		'shared:shared-session-page.tsrx#session/state:data',
		'shared:shared-session-page.tsrx#session/computed:signedIn',
	]);

	expect(text(container, '[data-status]')).toBe('anonymous');
	expect(text(container, '[data-user]')).toBe('none');

	required<HTMLButtonElement>(container, 'button[data-login]').click();

	await expect.poll(() => text(container, '[data-status]')).toBe('ready');
	expect(text(container, '[data-user]')).toBe('ada');
	expect(text(container, '[data-signed-in]')).toBe('true');
});

test('CSR: two definitions in one module update independently', async () => {
	const screen = await render(SharedTwoDefinitionsPage);
	const container = screen.container as HTMLElement;

	expect(text(container, '[data-status]')).toBe('anonymous');
	expect(text(container, '[data-mode]')).toBe('light');

	required<HTMLButtonElement>(container, 'button[data-sign-in]').click();
	await expect.poll(() => text(container, '[data-status]')).toBe('ready');
	expect(text(container, '[data-signed-in]')).toBe('true');
	expect(text(container, '[data-mode]')).toBe('light');

	required<HTMLButtonElement>(container, 'button[data-toggle]').click();
	await expect.poll(() => text(container, '[data-mode]')).toBe('dark');
	expect(text(container, '[data-status]')).toBe('ready');
});

test('SSR resume: two definitions keep separate payload ids and separate updates', async () => {
	const screen = await renderSSR(SharedTwoDefinitionsPage);
	const container = screen.container;

	expect(sharedNodeIds(container)).toEqual([
		'shared:shared-two-definitions-page.tsrx#session/state:data',
		'shared:shared-two-definitions-page.tsrx#theme/state:data',
		'shared:shared-two-definitions-page.tsrx#session/computed:signedIn',
	]);

	expect(text(container, '[data-status]')).toBe('anonymous');
	expect(text(container, '[data-signed-in]')).toBe('false');
	expect(text(container, '[data-mode]')).toBe('light');

	required<HTMLButtonElement>(container, 'button[data-toggle]').click();
	await expect.poll(() => text(container, '[data-mode]')).toBe('dark');
	expect(text(container, '[data-status]')).toBe('anonymous');

	required<HTMLButtonElement>(container, 'button[data-sign-in]').click();
	await expect.poll(() => text(container, '[data-status]')).toBe('ready');
	expect(text(container, '[data-signed-in]')).toBe('true');
	expect(text(container, '[data-mode]')).toBe('dark');
});

// A definition imported from another .tsrx module is not covered here: the
// bundler's first transform pass fails the page closed with
// MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED, so no fixture can mount. The
// compiler suite pins that blocker in shared-render-lowering.test.ts.
