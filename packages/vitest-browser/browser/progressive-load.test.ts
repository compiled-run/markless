import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import EventOnly from './fixtures/progressive-event-only.tsrx';
import FullTier from './fixtures/progressive-full-tier.tsrx';
import { executedModules, resetExecutedModules } from './support/progressive-helpers.ts';

afterEach(async () => {
	resetExecutedModules();
	await cleanup();
});

test('progressive execution: load executes zero runtime modules for full and event-only tiers', async () => {
	const fullRender = await renderSSRPhased(FullTier);
	resetExecutedModules();
	const full = fullRender.mount();
	await expect.poll(() => full.container.querySelector('[data-async-container]')).not.toBeNull();
	expect.soft(executedModules()).toEqual([]);

	await cleanup();
	resetExecutedModules();
	const eventOnlyRender = await renderSSRPhased(EventOnly);
	resetExecutedModules();
	const eventOnly = eventOnlyRender.mount();
	await expect
		.poll(() => eventOnly.container.querySelector('[data-async-container]'))
		.not.toBeNull();
	expect.soft(executedModules()).toEqual([]);
});
