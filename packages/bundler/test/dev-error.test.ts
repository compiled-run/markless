import { describe, expect, test } from 'vitest';
import { createDevErrorClientAsset } from '../src/dev-error/client-asset.ts';
import {
	MARKLESS_DEV_ERROR_CLEAR_EVENT,
	MARKLESS_DEV_ERROR_CLIENT_ID,
	MARKLESS_DEV_ERROR_EVENT,
	renderMarklessDevErrorDocument,
	renderMarklessDevErrorPlainText,
	type MarklessDevErrorPayload,
} from '../src/dev-error/index.ts';

const payload: MarklessDevErrorPayload = {
	version: 1,
	id: '/workspace/src/Unsafe.tsrx',
	kind: 'compile',
	diagnostics: [
		{
			code: 'MARKLESS_PRIMARY',
			message: 'Unexpected <script> & value',
			filename: '/workspace/src/Unsafe.tsrx',
			line: 3,
			column: 7,
			why: 'The value is <unsafe>.',
			suggestion: 'Use a safe expression.',
			docsUrl: 'https://markless.dev/errors/MARKLESS_PRIMARY',
			frame: '> 3 | <script>\n    |       ^',
		},
		{
			code: 'MARKLESS_SECONDARY',
			message: 'Another problem',
			filename: '/workspace/src/Other file.tsrx',
			line: 8,
			column: 2,
			why: 'A second reason.',
			suggestion: 'Make another change.',
			frame: '> 8 | bad\n    |  ^',
		},
	],
	details: 'MARKLESS_COMPILE_BLOCKED\n<script>alert(1)</script>',
	stack: 'Error: <stack>',
};

describe('development error surface', () => {
	test('exports stable transport and virtual-module constants', () => {
		expect(MARKLESS_DEV_ERROR_EVENT).toBe('markless:dev-error');
		expect(MARKLESS_DEV_ERROR_CLEAR_EVENT).toBe('markless:dev-error-clear');
		expect(MARKLESS_DEV_ERROR_CLIENT_ID).toBe('virtual:markless:dev-error-client');
	});

	test('renders escaped, readable server HTML in the specified layout order', () => {
		const html = renderMarklessDevErrorDocument(payload, { base: '/docs/' });

		expect(html).toContain('<!doctype html>');
		expect(html).toContain('Unexpected &lt;script&gt; &amp; value');
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain(
			'href="/docs/__open-in-editor?file=%2Fworkspace%2Fsrc%2FUnsafe.tsrx%3A3%3A7"',
		);
		expect(html).toContain('>Why<');
		expect(html).toContain('>Suggested fix<');
		expect(html).toContain('<details><summary>MARKLESS_SECONDARY — Another problem</summary>');
		expect(html).toContain('<details><summary>Technical details</summary>');
		expect(html).toContain('window.__MARKLESS_DEV_ERROR__ = ');
		expect(html).toContain('\\u003cscript>');

		const order = [
			'Unexpected &lt;script&gt;',
			'/workspace/src/Unsafe.tsrx:3:7',
			'>Why<',
			'>Suggested fix<',
			'&gt; 3 | &lt;script&gt;',
			'Read MARKLESS_PRIMARY documentation',
			'MARKLESS_SECONDARY — Another problem',
			'Technical details',
		].map((part) => html.indexOf(part));
		expect(order.every((index) => index >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	test('only renders documentation links with an HTTP or HTTPS URL', () => {
		for (const docsUrl of ['javascript:alert(1)', 'data:text/html,unsafe', 'not a URL']) {
			const html = renderMarklessDevErrorDocument({
				...payload,
				diagnostics: [{ ...payload.diagnostics[0]!, docsUrl }],
			});
			expect(html).not.toContain('Read MARKLESS_PRIMARY documentation');
		}

		for (const docsUrl of [
			'https://markless.dev/errors/MARKLESS_PRIMARY',
			'http://localhost:3000/errors/MARKLESS_PRIMARY',
		]) {
			const html = renderMarklessDevErrorDocument({
				...payload,
				diagnostics: [{ ...payload.diagnostics[0]!, docsUrl }],
			});
			expect(html).toContain(`href="${docsUrl}"`);
		}
	});

	test('keeps a plain-text fallback readable without client JavaScript', () => {
		const html = renderMarklessDevErrorDocument(payload);
		expect(html).toContain('<main');
		expect(html).toContain('MARKLESS_COMPILE_BLOCKED');
		expect(html).toContain('Fix the error and reload');
		expect(renderMarklessDevErrorPlainText(payload)).toBe(
			`${payload.details}\n\n${payload.stack}`,
		);
	});

	test('emits a dependency-free browser asset outside the application graph', () => {
		const source = createDevErrorClientAsset('/docs/@vite/client');
		expect(source).toContain('from "/docs/@vite/client"');
		expect(source).toContain('markless-dev-error-overlay');
		expect(source).toContain('const OPEN_IN_EDITOR = "/docs/__open-in-editor"');
		expect(source).toContain(
			"encodeURIComponent(diagnostic.filename + ':' + diagnostic.line + ':' + diagnostic.column)",
		);
		expect(source).toContain("url.protocol === 'http:' || url.protocol === 'https:'");
		expect(source).toContain("attachShadow({ mode: 'open' })");
		for (const forbidden of [
			'@markless/web',
			'@markless/core',
			'virtual:markless:payload',
			'virtual:markless:resume',
			'node:fs',
		]) {
			expect(source).not.toContain(forbidden);
		}
	});
});
