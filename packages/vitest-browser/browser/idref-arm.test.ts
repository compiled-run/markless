import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ArmPanel from './fixtures/idref-arm-panel.tsrx';
import ArmInside from './fixtures/idref-arm-inside.tsrx';
import ArmReference from './fixtures/idref-arm-reference.tsrx';

// A handle bound inside an @if arm and named outside it: when the arm arrives,
// its element has to carry the very id the outside reference already points at.
afterEach(() => cleanup());

function parts(container: ParentNode) {
	return {
		trigger: container.querySelector<HTMLButtonElement>('[data-arm-trigger]'),
		sheet: () => container.querySelector<HTMLElement>('[data-arm-sheet]'),
	};
}

async function expectArmCarriesTheReferencedId(container: ParentNode) {
	const { trigger, sheet } = parts(container);
	const controls = trigger?.getAttribute('aria-controls');
	expect(controls).toBeTruthy();
	expect(sheet()).toBeNull();

	trigger?.click();
	await expect.poll(() => sheet()).not.toBeNull();
	expect(sheet()?.id).toBe(controls);
	expect(trigger?.getAttribute('aria-controls')).toBe(controls);
}

test('CSR: an arm bound handle carries the id its outside reference names', async () => {
	const screen = await render(ArmPanel);
	await expectArmCarriesTheReferencedId(screen.container as HTMLElement);
});

test('SSR: an arm bound handle shown after resume carries the served reference id', async () => {
	const screen = await renderSSR(ArmPanel);
	await expectArmCarriesTheReferencedId(screen.container as HTMLElement);
});

async function expectArmReferenceNamesTheElement(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-arm-trigger]')?.click();
	await expect.poll(() => container.querySelector('[data-arm-ref]')).not.toBeNull();
	const id = container.querySelector('[data-arm-sheet]')?.id;
	expect(id).toBeTruthy();
	expect(container.querySelector('[data-arm-ref]')?.getAttribute('aria-describedby')).toBe(id);
}

test('CSR: a reference and its element arriving in one arm share one id', async () => {
	const screen = await render(ArmInside);
	await expectArmReferenceNamesTheElement(screen.container as HTMLElement);
});

test('SSR: a reference and its element arriving in one arm after resume share one id', async () => {
	const screen = await renderSSR(ArmInside);
	await expectArmReferenceNamesTheElement(screen.container as HTMLElement);
});

test('CSR: a reference arriving with an arm names the element outside it', async () => {
	const screen = await render(ArmReference);
	await expectArmReferenceNamesTheElement(screen.container as HTMLElement);
});

test('SSR: a reference arriving with an arm after resume names the element outside it', async () => {
	const screen = await renderSSR(ArmReference);
	await expectArmReferenceNamesTheElement(screen.container as HTMLElement);
});
