import { expect, test } from 'vitest';
import { parseRequestFile, transformRequestFileSource } from '../src/request-files.ts';

test('classifies non-request files as neither API nor middleware', () => {
	expect(parseRequestFile('pages/index.tsrx', 'export default function Page() {}')).toEqual({
		diagnostics: [],
		file: 'pages/index.tsrx',
		kind: 'none',
	});
});

test('parses API method suffixes, route params, and default functions', () => {
	expect(
		parseRequestFile(
			'api/users/[id].get.ts',
			'export default async function (http) { return http.params.id; }',
		),
	).toMatchObject({
		defaultExport: {
			kind: 'function',
			parameterName: 'http',
		},
		diagnostics: [],
		file: 'api/users/[id].get.ts',
		kind: 'api',
		method: 'get',
		route: {
			params: [{ kind: 'dynamic', name: 'id' }],
			pathname: '/api/users/:id',
			pattern: '/api/users/[id]',
		},
	});
});

test('parses catch-all API params and all-method endpoints', () => {
	expect(
		parseRequestFile(
			'api/proxy/[...path].ts',
			'const route = async (http) => http.params.path; export default route;',
		),
	).toMatchObject({
		defaultExport: { kind: 'function', parameterName: 'http' },
		diagnostics: [],
		kind: 'api',
		method: 'all',
		route: {
			params: [{ kind: 'catch-all', name: 'path' }],
			pathname: '/api/proxy/**',
			pattern: '/api/proxy/[...path]',
		},
	});
});

test('parses endpoint cache metadata and middleware default functions', () => {
	expect(
		parseRequestFile(
			'api/posts.get.ts',
			'export const cache = { maxAge: 60 }; export default function () {}',
		),
	).toMatchObject({
		cache: { maxAge: 60 },
		diagnostics: [],
		kind: 'api',
		method: 'get',
	});
	expect(
		parseRequestFile(
			'middleware/01.auth.ts',
			'export default async (http) => { http.locals.user = {}; };',
		),
	).toMatchObject({
		defaultExport: { kind: 'function', parameterName: 'http' },
		diagnostics: [],
		file: 'middleware/01.auth.ts',
		kind: 'middleware',
	});
});

test('diagnoses invalid request files', () => {
	expect(parseRequestFile('api/posts.get.ts', 'export const value = 1;').diagnostics).toEqual([
		{ code: 'missing-default-function', message: 'API files must default export a function.' },
	]);
	expect(
		parseRequestFile(
			'api/posts.ts',
			'export async function GET() { return {}; } export default function () {}',
		).diagnostics,
	).toEqual([
		{
			code: 'http-method-export',
			message: 'Do not export GET; the HTTP method comes from the filename.',
		},
	]);
	expect(
		parseRequestFile(
			'api/posts.get.ts',
			'export const cache = 60; export default function () {}',
		).diagnostics,
	).toEqual([
		{
			code: 'invalid-cache-metadata',
			message: 'Use export const cache for endpoint cache metadata.',
		},
	]);
});

test('wraps API and middleware files for Nitro with Arcade HTTP context', () => {
	expect(
		transformRequestFileSource(
			'api/users/[id].get.ts',
			'export default async function (http) { return http.params.id; }',
		)?.code,
	).toContain(
		'import { __arcadeCreateHttpContext as __arcade_create_http_context__ } from "@arcade/router";',
	);
	expect(
		transformRequestFileSource(
			'api/posts.get.ts',
			'export const cache = { maxAge: 60 }; export default function () {}',
		)?.code,
	).toContain('import { defineCachedHandler as __arcade_define_handler__ } from "nitro/cache";');
	expect(
		transformRequestFileSource(
			'middleware/01.auth.ts',
			'const auth = (http) => { http.locals.user = {}; }; export default auth;',
		)?.code,
	).toContain('auth(__arcade_create_http_context__(event))');
});
