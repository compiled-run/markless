import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as createCommand from './create-command.ts';
import * as scripts from './scripts.ts';

const figures = { 'create-command': createCommand, scripts };

describe('cli figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'cli.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('names every part of the command', () => {
		const texts = createCommand.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		for (const part of createCommand.PARTS) expect(texts).toContain(part.note);
		expect(createCommand.LINES.join(' ').replace(/\\\s+/, '')).toBe('npm create markless@latest my-app -- --yes --starter app --no-git');
	});
});
