import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ArmForm from './arm-form.tsrx';

afterEach(() => cleanup());

function submit(container: ParentNode): boolean {
	const form = container.querySelector<HTMLFormElement>('form[data-arm]')!;
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

async function expectRebuiltArmCancels(container: HTMLElement) {
	const toggle = container.querySelector<HTMLButtonElement>('[data-toggle]')!;
	toggle.click();
	await expect.poll(() => container.querySelector('form[data-arm]')).toBeNull();
	toggle.click();
	await expect.poll(() => container.querySelector('form[data-arm]')).not.toBeNull();
	expect(submit(container)).toBe(true);
	await expect.poll(() => container.querySelector('[data-sent]')!.textContent).toBe('arm');
}

test('SSR: a form in an @if arm the browser rebuilt cancels its submit inside the dispatch', async () => {
	await expectRebuiltArmCancels((await renderSSR(ArmForm)).container as HTMLElement);
});

test('CSR: a form in an @if arm the browser rebuilt cancels its submit inside the dispatch', async () => {
	await expectRebuiltArmCancels((await render(ArmForm)).container as HTMLElement);
});
