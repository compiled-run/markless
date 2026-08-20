import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/composite-refresh-page.tsrx';

// A composite expression over a shared instance read has to follow a write the
// same way the plain path read beside it does. Before the synthetic computed
// covered these positions, every one of them kept the value it first rendered.
afterEach(() => cleanup());

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-widget="${name}"]`);
	if (!host) throw new Error(`Expected widget "${name}".`);
	const frame = host.querySelector('[data-frame]');
	const handle = host.querySelector<HTMLButtonElement>('[data-handle]');
	if (!frame || !handle) throw new Error(`Widget "${name}" is missing its parts.`);
	return { frame, handle };
}

function reading(container: ParentNode, name: string) {
	const { frame, handle } = widget(container, name);
	return {
		framePresence: frame.hasAttribute('ui-wide'),
		pinnedPresence: frame.hasAttribute('ui-pinned'),
		handlePresence: handle.hasAttribute('ui-wide'),
		phase: handle.getAttribute('data-phase'),
		expanded: handle.getAttribute('aria-expanded'),
		banner: handle.getAttribute('data-banner'),
		shout: handle.getAttribute('data-shout'),
		text: handle.textContent,
	};
}

const shut = {
	framePresence: false,
	handlePresence: false,
	phase: 'shut',
	expanded: 'false',
	banner: 'NOT WIDE',
	shout: 'no',
	text: 'shut',
};
const wide = {
	framePresence: true,
	handlePresence: true,
	phase: 'wide',
	expanded: 'true',
	banner: 'WIDE',
	shout: 'yes',
	text: 'wide',
};

async function expectFollowsTheWrite(container: ParentNode) {
	expect(reading(container, 'left')).toEqual({ ...shut, pinnedPresence: true });
	expect(reading(container, 'right')).toEqual({ ...shut, pinnedPresence: false });

	widget(container, 'left').handle.click();
	await expect.poll(() => reading(container, 'left').phase).toBe('wide');
	// Every recombined position moved with the plain read, and only in the
	// widget that was clicked.
	expect(reading(container, 'left')).toEqual({ ...wide, pinnedPresence: true });
	expect(reading(container, 'right')).toEqual({ ...shut, pinnedPresence: false });

	widget(container, 'left').handle.click();
	await expect.poll(() => reading(container, 'left').phase).toBe('shut');
	// Presence semantics survive the round trip: a false comparison removes the
	// attribute rather than writing "false".
	expect(reading(container, 'left')).toEqual({ ...shut, pinnedPresence: true });
}

test('CSR: every composite over a shared read follows the write', async () => {
	const screen = await render(Page);
	await expectFollowsTheWrite(screen.container as HTMLElement);
});

test('SSR resume: every composite over a shared read follows the write', async () => {
	const screen = await renderSSR(Page);
	await expectFollowsTheWrite(screen.container);
});
