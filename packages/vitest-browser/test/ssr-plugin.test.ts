import { expect, test } from 'vitest';
import { transformRenderSsrCalls } from '../src/ssr-plugin.ts';

const testFileId = '/repo/packages/vitest-browser/browser/example.test.ts';

test('rewrites renderSSR(Component) into the browser command RPC', () => {
	const code = [
		"import { renderSSR } from '../src/index.ts';",
		"import Counter from './fixtures/counter.tsrx';",
		'const screen = await renderSSR(Counter);',
	].join('\n');

	const result = transformRenderSsrCalls(code, testFileId);
	expect(result?.code).toContain(
		'__marklessSsrCommands.renderSSR("/repo/packages/vitest-browser/browser/fixtures/counter.tsrx", "default")',
	);
	expect(result?.code).toContain('__marklessRenderServerHTML(ssr.html)');
	expect(result?.code).toContain(
		"import { commands as __marklessSsrCommands } from 'vitest/browser';",
	);
	expect(result?.code).toContain('from "../src/index.ts"');
});

test('forwards supported render options through the browser command RPC', () => {
	const code = [
		"import { renderSSR } from '../src/index.ts';",
		"import Settings from './fixtures/settings.tsrx';",
		"const screen = await renderSSR(Settings, { nonce: 'test-nonce' });",
	].join('\n');

	const result = transformRenderSsrCalls(code, testFileId);
	expect(result?.code).toContain(
		`__marklessSsrCommands.renderSSR("/repo/packages/vitest-browser/browser/fixtures/settings.tsrx", "default", { nonce: 'test-nonce' })`,
	);
});

test('leaves files without a renderSSR marker import untouched', () => {
	const code = 'export function renderSSR(component: unknown) { return component; }';
	expect(transformRenderSsrCalls(code, testFileId)).toBeNull();
});

test('rejects arguments beyond component and render options', () => {
	const code = [
		"import { renderSSR } from '../src/index.ts';",
		"import Counter from './fixtures/counter.tsrx';",
		"await renderSSR(Counter, { nonce: 'test-nonce' }, { start: 2 });",
	].join('\n');
	expect(() => transformRenderSsrCalls(code, testFileId)).toThrowError(
		/supports only a component and optional render options/,
	);
});

test('rejects components that are not imported from a .tsrx module', () => {
	const code = [
		"import { renderSSR } from '../src/index.ts';",
		'const Local = () => null;',
		'await renderSSR(Local);',
	].join('\n');
	expect(() => transformRenderSsrCalls(code, testFileId)).toThrowError(
		/must be imported from a separate \.tsrx module/,
	);
});
