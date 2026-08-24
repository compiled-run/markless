import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Local from './fixtures/arm-element-text.tsrx';
import Shared from './fixtures/arm-element-shared.tsrx';

// Text inside an element a branch arm owns has to follow its value exactly like
// text at the top of a component does. The failure this pins is a correctly
// served arm that then never changes: when the arm's branch is decided by a
// prop the placement never passes, composition used to drop the whole branch
// record, and the arm's own updates went with it while attributes on the same
// element stayed live.
afterEach(() => cleanup());

function local(container: ParentNode) {
	return {
		wrapped: container.querySelector<HTMLElement>('[data-wrapped]'),
		plain: container.querySelector<HTMLElement>('[data-plain]'),
		bump: container.querySelector<HTMLButtonElement>('[data-bump]'),
		flip: container.querySelector<HTMLButtonElement>('[data-flip]'),
	};
}

async function expectLocalArmRefreshes(container: ParentNode) {
	expect(local(container).wrapped?.textContent).toBe('count is 0');

	local(container).bump?.click();
	await expect.poll(() => local(container).wrapped?.textContent).toBe('count is 1');

	// Flip to the other arm and back: the re-entered arm is live again, not
	// frozen at the value it was first served with.
	local(container).flip?.click();
	await expect.poll(() => local(container).plain?.textContent).toBe('1');
	local(container).bump?.click();
	await expect.poll(() => local(container).plain?.textContent).toBe('2');

	local(container).flip?.click();
	await expect.poll(() => local(container).wrapped?.textContent).toBe('count is 2');
	local(container).bump?.click();
	await expect.poll(() => local(container).wrapped?.textContent).toBe('count is 3');
}

function shared(container: ParentNode) {
	return {
		own: container.querySelector<HTMLElement>('[data-own]'),
		out: container.querySelector<HTMLElement>('[data-out]'),
		bump: container.querySelector<HTMLButtonElement>('[data-bump]'),
	};
}

async function expectSharedArmRefreshes(container: ParentNode) {
	expect(shared(container).own?.textContent).toBe('0');
	// The attribute on the arm's own owning element is the control: it was
	// already live while the text inside the arm was stuck.
	expect(shared(container).out?.getAttribute('ui-value')).toBe('0');

	shared(container).bump?.click();
	await expect.poll(() => shared(container).out?.getAttribute('ui-value')).toBe('1');
	expect(shared(container).own?.textContent).toBe('1');

	shared(container).bump?.click();
	await expect.poll(() => shared(container).own?.textContent).toBe('2');
	// The branch markers survive: nothing overwrote the whole element's content.
	expect(shared(container).own).not.toBeNull();
}

test('CSR: text inside an element the arm owns refreshes, across a flip and back', async () => {
	const screen = await render(Local);
	await expectLocalArmRefreshes(screen.container as HTMLElement);
});

test('SSR resume: the served arm text refreshes, across a flip and back', async () => {
	const screen = await renderSSR(Local);
	await expectLocalArmRefreshes(screen.container);
});

test('CSR: an arm decided by an absent prop still refreshes its own element text', async () => {
	const screen = await render(Shared);
	await expectSharedArmRefreshes(screen.container as HTMLElement);
});

test('SSR resume: an arm decided by an absent prop stays live after resume', async () => {
	const screen = await renderSSR(Shared);
	await expectSharedArmRefreshes(screen.container);
});
