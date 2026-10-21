import { describe, expect, it } from 'vitest';
import { compileFiles } from './compile.ts';
import type { CompileOutcome } from './protocol.ts';
import { readFileSync } from './source-fs.ts';
import { workerSourceHost } from './worker-sources.ts';

const entry = `import Label from './label.tsrx';

export default function Card() @{
	<section><Label /></section>
}
`;
const label = (text: string) => `export default function Label() @{
	<strong>{'${text}'}</strong>
}
`;

function allCode(outcome: CompileOutcome): string {
	if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
	return outcome.modules.map((module) => module.code).join('\n');
}

describe('workerSourceHost', () => {
	it('keeps two blocks with the same file names apart in the shared file system', async () => {
		const first = workerSourceHost('first');
		const second = workerSourceHost('second');
		const files = (text: string) => [
			{ name: 'card.tsrx', code: entry },
			{ name: 'label.tsrx', code: label(text) },
		];

		const firstOutcome = await compileFiles(files('Plum'), 'code-1', first);
		const secondOutcome = await compileFiles(files('Teal'), 'code-2', second);
		const firstAgain = await compileFiles(
			[{ name: 'card.tsrx', code: entry }],
			'code-3',
			first,
		);

		expect(first.codeDir).not.toBe(second.codeDir);
		expect(firstOutcome.ok && firstOutcome.entry).toBe(`${first.codeDir}card.tsrx`);
		expect(allCode(firstOutcome)).toContain("'Plum'");
		expect(allCode(firstOutcome)).not.toContain("'Teal'");
		expect(allCode(secondOutcome)).toContain("'Teal'");
		expect(allCode(secondOutcome)).not.toContain("'Plum'");
		expect(
			secondOutcome.ok &&
				secondOutcome.modules.some((module) => module.id.startsWith(first.codeDir)),
		).toBe(false);
		expect(readFileSync(`${second.codeDir}label.tsrx`)).toContain('Teal');
		expect(firstAgain.ok).toBe(false);
		expect(() => readFileSync(`${first.codeDir}label.tsrx`)).toThrow(/ENOENT/);
	});
});
