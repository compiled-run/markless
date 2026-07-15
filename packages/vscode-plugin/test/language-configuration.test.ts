import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('typing a tag close is left to the TSRX tag-closing extension', () => {
	const configurationPath = resolve(
		process.cwd(),
		'packages/vscode-plugin/language-configuration.json',
	);
	const jsonc = readFileSync(configurationPath, 'utf8');
	const configuration = JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, '')) as {
		autoClosingPairs?: Array<{ readonly open?: string }>;
	};

	expect(configuration.autoClosingPairs?.some((pair) => pair.open === '<')).toBe(false);
});
