import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing, RULES, SLIP, STAMP } from './order-slip.ts';

const slip = drawing();
const piece = readFileSync(new URL('./start-with-agent.tsrx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../pages/index.mdx', import.meta.url), 'utf8');
const turn = page.slice(page.indexOf('## Start your first app'));

describe('the Beanshop order slip', () => {
	it('keeps the prompt and the four prefilled assistant links exactly', () => {
		expect(piece).toContain(
			"'Help me build my first app with Markless (markless.dev). Read https://markless.dev/llms.txt first, then walk me through it.'",
		);
		const urls = ['https://claude.ai/new?q=', 'https://chatgpt.com/?hints=search&q=', 'https://grok.com/?q=', 'https://www.perplexity.ai/search?q='];
		for (const url of urls) expect(piece).toContain(`url: '${url}', mark: `);
		expect(piece.match(/url: '/g)).toHaveLength(urls.length);
		expect(piece).toContain('href={assistant.url + ASK}');
		expect(piece).not.toMatch(/gemini|copilot|copy & paste/i);
		expect(piece.match(/target="_blank"/g)).toHaveLength(1);
		expect(piece).toContain('rel="noopener"');
		expect(piece).toContain('Didn’t open? The prompt is already copied');
		expect(piece).not.toContain('also:');
	});

	it('prints one short order line and carries the full prompt as the stamps\' tooltip and description', () => {
		expect(piece).toContain('<b>your order:</b> help building my first Markless app ☕');
		expect(piece).toContain('title={PROMPT}');
		expect(piece).toContain('aria-describedby="order-prompt"');
		expect(piece).toMatch(/id="order-prompt">\{[^}]*PROMPT\}/);
		expect(piece).not.toContain('<details');
	});

	it('copies the command from a real, named button with a polite status', () => {
		expect(piece).toContain('aria-label={\'Copy the command: \' + COMMAND}');
		expect(piece).toContain("const COMMAND = 'npm create markless@latest';");
		expect(piece).toMatch(/aria-live="polite"/);
		expect(existsSync(new URL('./copy-command.tsrx', import.meta.url))).toBe(false);
	});

	it('is the only thing in the section after one short line, with no small print on the slip', () => {
		expect(turn.match(/<StartWithAgent \/>/g)).toHaveLength(1);
		const before = turn.slice('## Start your first app'.length, turn.indexOf('<StartWithAgent />')).trim();
		expect(before.split('\n').filter(Boolean)).toHaveLength(1);
		expect(turn.slice(turn.indexOf('<StartWithAgent />') + '<StartWithAgent />'.length).trim()).toBe('');
		expect(piece).not.toContain('pre-release');
	});

	it('lays four stamps on the slip in two columns and two rows, clear of each other', () => {
		expect(slip.stamps).toHaveLength(4);
		const [a, b] = STAMP.lefts;
		expect(a).toBeGreaterThanOrEqual(SLIP.inset);
		expect(a + STAMP.width).toBeLessThan(b);
		expect(b + STAMP.width).toBeLessThanOrEqual(SLIP.right - 22);
		const [top, bottom] = STAMP.tops;
		expect(top).toBeGreaterThan(RULES[1]);
		expect(top + STAMP.height).toBeLessThan(bottom);
		expect(bottom + STAMP.height).toBeLessThan(SLIP.tear);
		expect(SLIP.tear - (bottom + STAMP.height)).toBeLessThanOrEqual(24);
	});

	it('draws no pink construction lines', () => {
		expect(JSON.stringify(slip)).not.toContain('pencil');
		expect(piece).not.toContain('pencil');
	});

	it('rips the stub off and prints a fresh one, with a ragged edge left on the slip', () => {
		expect(slip.body.torn.ink.length).toBeGreaterThan(300);
		expect(slip.scissors.length).toBeGreaterThan(300);
		expect(slip.body.feed.length).toBeGreaterThan(SLIP.right - SLIP.left - 10);
		expect(piece).toMatch(/@keyframes snip-a/);
		expect(piece).toMatch(/@keyframes feed-a/);
		expect(piece).toContain('<span class="idle">tear to copy</span>');
		expect(piece).not.toMatch(/class="wash tag"|\.tag \{/);
		expect(piece).toMatch(/clip-path: inset\(100% /);
		expect(slip.stub.rip.length).toBeGreaterThan(SLIP.right - SLIP.left - 10);
		expect(piece).toMatch(/@keyframes tear-a/);
		expect(piece).toMatch(/prefers-reduced-motion: reduce\)'\)\.matches/);
	});

	it('inks every part', () => {
		expect(slip.body.ink.length).toBeGreaterThan(500);
		expect(slip.body.shadow.hatch.length).toBeGreaterThan(200);
		expect(slip.stamps.every((stamp) => stamp.ink.length > 300)).toBe(true);
		expect(slip.stub.holes.length).toBeGreaterThan(500);
		expect(slip.stub.rip.length).toBeGreaterThan(20);
	});

	it('draws the same slip every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(slip));
	});
});

describe('frozen art', () => {
	it('freezes the slip into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by start-with-agent.test.ts from order-slip.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './order-slip.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(slip, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./order-slip.art.ts');
	});
});
