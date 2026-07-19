import fs from 'node:fs';
import test from 'node:test';

import { runComparison } from './run.mjs';

test('records and validates all chained async lanes', async (context) => {
	let chromium;
	try {
		({ chromium } = await import('playwright'));
	} catch {
		context.skip(
			'Playwright package is missing; run pnpm install before this browser comparison',
		);
		return;
	}
	const executable = chromium.executablePath();
	if (!executable || !fs.existsSync(executable)) {
		context.skip('Playwright Chromium is missing; run pnpm exec playwright install chromium');
		return;
	}
	await runComparison(chromium);
});
