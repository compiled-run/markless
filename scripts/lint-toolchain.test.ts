import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';

// vite-plus resolves its linter and formatter from the working directory upward before its own
// copy, so a checkout nested in another (an agent worktree) must find them in its own root.
const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const vitePlus = createRequire(import.meta.url)('vite-plus/package.json');

test('the root pins the oxlint, oxfmt and tsgolint vite-plus runs, so lint never resolves them above the repo', () => {
	for (const tool of ['oxlint', 'oxfmt', 'oxlint-tsgolint'])
		expect(root.devDependencies[tool], tool).toBe(
			vitePlus.dependencies[tool].replace(/^=/, ''),
		);
});
