import { cleanup, render } from '../src/index.ts';
import { afterEach, beforeEach, expect, test } from 'vitest';
import App from './fixtures/arm-component-handler.tsrx';

// The defect below escapes the failing dispatch as an unhandled rejection and as
// a window error. Both are captured here so they cannot masquerade as a failure
// of another suite; the red test at the bottom is the record of the defect.
function isArmSymbolFailure(reason: unknown) {
	return String(reason).includes('Unknown async symbol');
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
	if (!isArmSymbolFailure(event.reason)) return;
	event.preventDefault();
}

function onWindowError(event: ErrorEvent) {
	if (!isArmSymbolFailure(event.error ?? event.message)) return;
	event.preventDefault();
}

beforeEach(() => {
	window.addEventListener('unhandledrejection', onUnhandledRejection);
	window.addEventListener('error', onWindowError);
});

afterEach(async () => {
	await cleanup();
	// Late rejections arrive after the gesture that caused them settles.
	await new Promise((resolve) => setTimeout(resolve, 100));
	window.removeEventListener('unhandledrejection', onUnhandledRejection);
	window.removeEventListener('error', onWindowError);
});

function pane(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-case="${name}"]`) as HTMLElement;
	if (!host) throw new Error(`Expected the "${name}" pane.`);
	return {
		host,
		button: host.querySelector('button') as HTMLButtonElement,
		clicks: host.querySelector('output') as HTMLOutputElement,
	};
}

test('CSR: a click handler runs beside a branch whose arm holds an element', async () => {
	const screen = await render(App);
	const { host, button, clicks } = pane(screen.container as HTMLElement, 'element-arm');
	button.click();
	await expect.poll(() => clicks.textContent).toBe('1');
	await expect.poll(() => host.querySelector('em')?.textContent).toBe('armed');
});

// U-K: swapping the branch content's plain element for a component reference used
// to silence every handler in the component that owns the branch. Same markup,
// same handler, same gesture as the test above — only the content differs.
test('CSR: a click handler runs beside a branch whose arm holds a component', async () => {
	const screen = await render(App);
	const { host, button, clicks } = pane(screen.container as HTMLElement, 'component-arm');
	button.click();
	await expect.poll(() => clicks.textContent).toBe('1');
	await expect.poll(() => host.querySelector('em')?.textContent).toBe('armed');
});
