import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NamespaceApp from './fixtures/member-expression-tags.tsrx';
import BarrelApp from './fixtures/member-expression-barrel-tags.tsrx';

// Member-expression tags (<checkbox.root />) name a component held on an
// imported object. Both fixtures consume the same headless component folder:
// NamespaceApp imports the parts barrel as a namespace, BarrelApp reads the
// object a top-level barrel re-exports with `export * as checkbox`.
afterEach(() => cleanup());

function expectMountedOff(container: ParentNode) {
	const root = container.querySelector<HTMLElement>('[data-checkbox-root]');
	expect(root).not.toBeNull();
	expect(root?.getAttribute('ui-checked')).toBe('off');
	expect(root?.querySelector('.checkbox-label')?.textContent).toBe('Subscribe');
	expect(container.querySelector('[data-checkbox-trigger]')).not.toBeNull();
}

async function expectTriggerFlipsToOn(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-checkbox-trigger]')?.click();
	await expect
		.poll(() => container.querySelector('[data-checkbox-root]')?.getAttribute('ui-checked'))
		.toBe('on');
}

test('CSR: a namespace-imported parts barrel mounts, projects children, and stays interactive', async () => {
	const screen = await render(NamespaceApp);
	expectMountedOff(screen.container as HTMLElement);
	await expectTriggerFlipsToOn(screen.container as HTMLElement);
});

test('SSR: a namespace-imported parts barrel renders on the server and resumes', async () => {
	const screen = await renderSSR(NamespaceApp);
	expect(screen.container.querySelector('[data-async-container]')).not.toBeNull();
	expectMountedOff(screen.container);
	await expectTriggerFlipsToOn(screen.container);
});

test('CSR: a re-exported parts object mounts, projects children, and stays interactive', async () => {
	const screen = await render(BarrelApp);
	expectMountedOff(screen.container as HTMLElement);
	await expectTriggerFlipsToOn(screen.container as HTMLElement);
});

test('SSR: a re-exported parts object renders on the server and resumes', async () => {
	const screen = await renderSSR(BarrelApp);
	expect(screen.container.querySelector('[data-async-container]')).not.toBeNull();
	expectMountedOff(screen.container);
	await expectTriggerFlipsToOn(screen.container);
});
