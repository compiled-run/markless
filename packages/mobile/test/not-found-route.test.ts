import { join } from 'node:path';
import { expect, it } from 'vitest';
import { NATIVE_NOT_FOUND_ROUTE } from '@markless/serializer/native-view';
import { compileRungApp } from '../src/harness/rung.ts';

it("carries the app's 404 page as a route whose page names that route, as each host checks", async () => {
	const { payload, diagnostics } = await compileRungApp(join(import.meta.dirname, '..', 'proofs', 'n5-not-found'));
	expect(diagnostics).toEqual([]);
	expect(payload?.routes.map((route) => [route.pattern, route.page.route?.pattern])).toEqual([
		['/', '/'],
		[NATIVE_NOT_FOUND_ROUTE, NATIVE_NOT_FOUND_ROUTE],
	]);
});
