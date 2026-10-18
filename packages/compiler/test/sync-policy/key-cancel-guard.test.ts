import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../../src/index.ts';

// A key handler's lifted cancel runs before the handler loads; one that is always true blocks Tab and every other key.
const repoRoot = resolve(import.meta.dirname, '../../../..');
const KEY_EVENTS = new Set(['keydown', 'keyup', 'keypress']);

test('no key handler in the repo lifts a cancel for every key', async () => {
	const files = execFileSync('git', ['ls-files', '*.tsrx'], { cwd: repoRoot, encoding: 'utf8' })
		.split('\n')
		.filter(Boolean);
	const everyKey: string[] = [];
	for (const file of files) {
		const source = readFileSync(resolve(repoRoot, file), 'utf8');
		if (
			!source.includes('@markless/') ||
			!source.includes('preventDefault') ||
			!/onKey/i.test(source)
		)
			continue;
		const graph = await buildSemanticGraph({ filename: file, source });
		for (const event of graph.events) {
			if (!KEY_EVENTS.has(event.eventName) || !event.syncPolicy) continue;
			const { when } = event.syncPolicy;
			if (when.type === 'constant-truthy' && when.value)
				everyKey.push(`${file} ${event.eventName}`);
		}
	}
	expect(everyKey).toEqual([]);
}, 120_000);
