import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';
import { callBuildStart, callTransform } from './helpers.ts';

// A delegate whose `import()` rejects used to leave no trace at all: the pass
// built the enriched diagnostic and both transform callers dropped it. The
// module still skips materialization, so the only evidence is the warning.
test('a delegate this build cannot import is reported through the plugin context', async () => {
	const fixtureRoot = await mkdtemp(resolve(import.meta.dirname, '.delegate-import-warning-'));
	const appRoot = resolve(fixtureRoot, 'app');
	const packageFilename = resolve(fixtureRoot, 'packages/BrokenFrame.mjs');
	await mkdir(resolve(appRoot, 'pages'), { recursive: true });
	await mkdir(resolve(fixtureRoot, 'packages'), { recursive: true });
	await writeFile(packageFilename, `throw new Error('BROKEN_DELEGATE_MODULE');\n`);
	const plugin = marklessClient({ rootDir: appRoot });
	const warn = vi.fn();

	try {
		callBuildStart(plugin, { cwd: appRoot });
		const page = (await callTransform(
			plugin,
			`import { BrokenFrame } from '@fixtures/broken-frame';
export default function Page() @{ <main><BrokenFrame /></main> }`,
			resolve(appRoot, 'pages/index.tsrx'),
			{
				resolve: vi.fn(async (specifier: string) =>
					specifier === '@fixtures/broken-frame' ? { id: packageFilename } : null,
				),
				getModuleInfo: () => ({ isEntry: true }),
				warn,
			},
		)) as { code: string };

		// Fail-open: the edge stays a runtime import instead of inlined markup.
		expect(page.code).toContain('@fixtures/broken-frame');
		expect(page.code).not.toContain('BROKEN_DELEGATE_MODULE');

		const messages = warn.mock.calls
			.map(([message]) => String(message))
			.filter((message) => message.includes('MARKLESS_DELEGATE_ARTIFACT_MISSING'));
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain(`Importing ${JSON.stringify(packageFilename)} failed:`);
		expect(messages[0]).toContain('BROKEN_DELEGATE_MODULE');
	} finally {
		await rm(fixtureRoot, { recursive: true, force: true });
	}
});
