import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CI_ERROR } from './explorer.ts';

const at = (path: string) => new URL('../../../../' + path, import.meta.url);
const toy = readFileSync(new URL('./explorer-figure.tsrx', import.meta.url), 'utf8');
const ci = readFileSync(at('.github/workflows/ci.yml'), 'utf8');
const toml = readFileSync(at('.ruler/ruler.toml'), 'utf8');

describe('specs and rules explorer figure', () => {
	it('draws the repo as it is', () => {
		for (const path of ['.ruler/AGENTS.md', '.ruler/claude.md', '.ruler/ruler.toml', '.ruler/skills', 'specs/framework-design.md', 'specs/framework', 'AGENTS.md', 'CLAUDE.md']) expect(existsSync(at(path))).toBe(true);
		expect(toml).toContain('output_path = "CLAUDE.md"');
		expect(toml).toContain('output_path = "AGENTS.md"');
	});

	it("shows the agent-files job's own error and the pnpm rules script", () => {
		expect(ci).toContain(CI_ERROR);
		expect(ci).toMatch(/^ {4}agent-files:$/m);
		expect(JSON.parse(readFileSync(at('package.json'), 'utf8')).scripts.rules).toContain('ruler');
	});

	it('answers press and keys, speaks each change, and drops animation under reduced motion', () => {
		for (const hook of ['onClick={() => editSource()}', 'onClick={() => editByHand()}', 'onClick={() => runRules()}', "event.key !== 'Escape'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});
