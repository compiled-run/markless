import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import PropExpressions from './prop-expression-page.tsrx';

afterEach(cleanup);

const gauges = () =>
	[...document.querySelectorAll('[data-gauge]')].map((gauge) => [
		gauge.textContent?.replace(/\s+/g, ''),
		gauge.getAttribute('data-mode'),
		gauge.getAttribute('aria-valuenow'),
	]);

const formatted = () => {
	const node = document.querySelector('[data-formatted]')!;
	return [node.textContent, node.getAttribute('data-out')];
};

const switched = () => {
	const node = document.querySelector('[data-switch]')!;
	return [node.getAttribute('data-tone'), node.getAttribute('aria-pressed')];
};

async function propExpressionsFollowTheParent() {
	expect(gauges()).toEqual([
		['H|h|H|2', 'h', '10'],
		['H|||3', 'none', '20'],
	]);
	expect(formatted()).toEqual(['#2', '#1']);
	expect(switched()).toEqual(['light', 'false']);
	document.querySelector<HTMLElement>('[data-flip]')!.click();
	await expect.poll(switched).toEqual(['dark', 'true']);
	await expect.poll(gauges).toEqual([
		['V|v|V|3', 'v', '20'],
		['H|||3', 'none', '20'],
	]);
	// A read into an object prop is left to its first render (the build warns), and must not throw.
	expect(formatted()).toEqual(['#2', '#1']);
}

test('CSR: a child expression over its props follows the state the parent passes', async () => {
	await render(PropExpressions);
	await propExpressionsFollowTheParent();
});

test('SSR: a child expression over its props follows the state the parent passes', async () => {
	await renderSSR(PropExpressions);
	await propExpressionsFollowTheParent();
});
