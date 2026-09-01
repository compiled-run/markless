import { render, renderCsrIslands, renderSSR, renderSSRIslands } from '@markless/vitest-browser';
import { expect, test } from 'vitest';
import ConsumerClass from './scenarios/consumer-class.tsrx';

// A family's CSS defaults are scoped to the family module's class, and a
// consumer's call-site class is scoped to the consumer's. A part handed a
// consumer class must carry both, in every mount, or the layered defaults the
// family ships never match it.
const ANCHOR = '--ui-tooltip';

function triggers(): HTMLElement[] {
	const found = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="trigger"]'));
	if (found.length === 0) throw new Error('Expected at least one trigger on the page.');
	return found;
}

function expectBothScopesApply(trigger: HTMLElement) {
	const style = getComputedStyle(trigger);
	expect(trigger.classList.contains('pg-dot')).toBe(true);
	// The consumer's own scoped rule reaches the part it named.
	expect(style.letterSpacing).toBe('3px');
	// The family's layered default reaches the same element.
	expect(style.getPropertyValue('anchor-name')).toBe(ANCHOR);
}

test('CSR: a trigger with a consumer class keeps the family scope class', async () => {
	await render(ConsumerClass);
	for (const trigger of triggers()) expectBothScopesApply(trigger);
});

test('SSR: a trigger with a consumer class keeps the family scope class', async () => {
	await renderSSR(ConsumerClass);
	for (const trigger of triggers()) expectBothScopesApply(trigger);
});

test('SSR islands: every island trigger with a consumer class keeps the family scope class', async () => {
	await renderSSRIslands([ConsumerClass, ConsumerClass]);
	const found = triggers();
	expect(found).toHaveLength(2);
	for (const trigger of found) expectBothScopesApply(trigger);
});

test('CSR islands: every island trigger with a consumer class keeps the family scope class', async () => {
	await renderCsrIslands([ConsumerClass, ConsumerClass]);
	const found = triggers();
	expect(found).toHaveLength(2);
	for (const trigger of found) expectBothScopesApply(trigger);
});
