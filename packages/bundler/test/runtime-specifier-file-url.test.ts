import { describe, expect, it } from 'vitest';
import { fileUrlModuleId } from '../src/build/delegate-loader.ts';

// A resolved runtime specifier becomes a module id Vite can load on both POSIX and Windows runners.
describe('fileUrlModuleId', () => {
	it('keeps a POSIX path absolute', () => {
		expect(fileUrlModuleId('file:///Users/runner/work/web/src/fns/ssr.ts')).toBe(
			'/Users/runner/work/web/src/fns/ssr.ts',
		);
	});

	it('starts a Windows path at its drive letter, not at a slash Vite reads as a root-relative URL', () => {
		expect(fileUrlModuleId('file:///D:/a/markless/packages/web/src/fns/ssr.ts')).toBe(
			'D:/a/markless/packages/web/src/fns/ssr.ts',
		);
	});

	it('decodes escaped characters', () => {
		expect(fileUrlModuleId('file:///C:/My%20Work/web/index.ts')).toBe(
			'C:/My Work/web/index.ts',
		);
	});

	it('answers undefined for anything that is not a file URL', () => {
		expect(fileUrlModuleId('https://example.com/x.ts')).toBeUndefined();
		expect(fileUrlModuleId(undefined)).toBeUndefined();
	});
});
