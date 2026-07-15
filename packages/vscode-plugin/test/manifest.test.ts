import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('defaults Emmet to HTML syntax for Markless TSRX', () => {
	const manifest = JSON.parse(
		readFileSync(resolve(process.cwd(), 'packages/vscode-plugin/package.json'), 'utf8'),
	) as {
		contributes?: {
			configurationDefaults?: Record<string, unknown>;
		};
	};

	expect(manifest.contributes?.configurationDefaults).toMatchObject({
		'emmet.includeLanguages': {
			'markless-tsrx': 'html',
		},
	});
});
