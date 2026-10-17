import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import InlineScript from './fixtures/inline-script.tsrx';

// Text inside <script> is raw text: &, <, > and quotes reach the browser unescaped.
afterEach(() => cleanup());

async function expectInlineScript(container: HTMLElement) {
	expect(container.querySelector('[data-inline]')?.textContent).toBe(
		`window.__inlineProbe = (1 < 2 && 3 > 2) ? 'a&b "q"' : 'no';`,
	);
}

test('CSR: inline <script> text is not HTML-escaped', async () => {
	const screen = await render(InlineScript);
	await expectInlineScript(screen.container as HTMLElement);
});

test('SSR: inline <script> text is not HTML-escaped', async () => {
	const screen = await renderSSR(InlineScript);
	await expectInlineScript(screen.container as HTMLElement);
});
