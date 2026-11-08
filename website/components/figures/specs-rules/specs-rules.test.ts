import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMAND, OPENED, OUTPUTS, RAIL, SAME_PR, SOURCE, SPECS, STAMP, STEPS } from './explorer.ts';

const at = (path: string) => new URL('../../../../' + path, import.meta.url);
const read = (path: string) => readFileSync(at(path), 'utf8');
const toy = readFileSync(new URL('./explorer-figure.tsrx', import.meta.url), 'utf8');

describe('specs and rules step-through', () => {
	it('opens a real spec, and shows its real first lines', () => {
		for (const name of SPECS) expect(existsSync(at('specs/' + name))).toBe(true);
		const spec = read(OPENED.path);
		expect(spec.split('\n')[0]).toBe(OPENED.title);
		expect(spec).toContain(OPENED.line.replace(', …', ''));
	});

	// SAME_PR is a real pull request that changed both files; CI checks out one commit, so only their existence is checked here.
	it('staples a code change to its spec change, both real files', () => {
		expect(existsSync(at(SAME_PR.code))).toBe(true);
		expect(existsSync(at(SAME_PR.spec))).toBe(true);
		expect(toy).toContain('url="pull request ' + SAME_PR.number + '"');
	});

	it('writes the outputs ruler.toml names, each stamped with its source the way Ruler writes it, from pnpm rules', () => {
		const toml = read('.ruler/ruler.toml');
		for (const out of OUTPUTS) {
			expect(toml).toContain('output_path = "' + out + '"');
			expect(read(out)).toContain(STAMP);
		}
		expect(existsSync(at(SOURCE))).toBe(true);
		expect(COMMAND).toBe('pnpm rules');
		expect(JSON.parse(read('package.json')).scripts.rules).toContain('ruler');
		expect(read('.github/workflows/ci.yml')).toMatch(/^ {4}agent-files:$/m);
	});

	it('walks four steps, and steps with Next, the rail, arrows and swipe', () => {
		expect(STEPS).toHaveLength(4);
		expect(RAIL.map((r) => r.key)).toEqual([0, 1, 2, 3]);
		for (const hook of ["event.key === 'ArrowRight'", "event.key === 'ArrowLeft'", 'onPointerUp', 'onClick={() => go(dot.key)}', 'onClick={() => next()}', 'onClick={() => write()}', 'onClick={() => rules()}', "tagName === 'INPUT'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});
