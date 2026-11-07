import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASKING, COMMAND, CHIPS, DONE, drawing, FLAGS } from './session.ts';

const art = drawing();
const source = readFileSync(new URL('../../../../packages/cli/src/index.ts', import.meta.url), 'utf8');
const ports = readFileSync(new URL('../../../../packages/cli/src/starter-ports.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../../pages/reference/cli.mdx', import.meta.url), 'utf8');
const words = (line: string) => line.replace(/^[┌│◇◆└●○…\s]+/, '');

describe('cli session figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});

	it('is frozen (refresh with -u after a geometry change)', async () => {
		const module = `// Written by cli.test.ts from session.ts. Refresh with the figure tests and -u.
import type { drawing } from './session.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./session.art.ts');
	});

	it("runs the page's own command", () => {
		expect(page).toContain(COMMAND + ' -- ' + FLAGS);
		for (const chip of CHIPS.slice(1)) expect(FLAGS).toContain(chip.flag);
	});

	it('prints only what packages/cli prints, up to its first question', () => {
		for (const line of ASKING.map(words).filter(Boolean)) expect(source).toContain(line);
		expect(source).toContain("initialValue: 'minimal'");
		expect(source).toContain("label: 'Learn Markless'");
		for (const line of DONE.map(words).filter((w) => w && !w.startsWith('cd ') && w !== 'npm run dev' && w !== 'Created my-app' && !w.startsWith('http'))) expect(source).toContain(line);
		expect(source).toContain('`Created ${options.target}`');
		expect(ports).toContain('app: 3000');
	});
});
