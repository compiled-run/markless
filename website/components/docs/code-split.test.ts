import { renderToString, type SsrRenderable } from '@markless/core';
import { describe, expect, it } from 'vitest';
import Code from './code.tsrx';

// The compiled module is an SSR artifact; its editor type is the authored component.
const render = (props: Record<string, unknown>) =>
	renderToString(Code as unknown as SsrRenderable, { props });

const block = (code: string) => ({ files: [{ name: 'app.tsrx', code }], panes: [] });

const all = (html: string, pattern: RegExp): string[] => [...(html.match(pattern) ?? [])];

describe('the playground split', () => {
	it('lays the code and the result side by side in one resizable group with a labelled divider', async () => {
		const html = await render(block('export default function App() @{ <p>Hi</p> }'));
		expect(all(html, /<div[^>]*\bui-panels\b[^>]*>/g)).toHaveLength(1);

		const panels = all(html, /<div[^>]*\bui-panel\b[^>]*>/g);
		expect(panels).toHaveLength(2);
		expect(panels[0] ?? '').toMatch(/class="[^"]*\bsource\b/);
		expect(panels[1] ?? '').toMatch(/class="[^"]*\bresult\b/);
		expect(panels[1] ?? '').toContain('data-code-result');
		expect(panels[0] ?? '').toContain('--size: 64');
		expect(panels[1] ?? '').toContain('--size: 36');

		const divider = all(html, /<div[^>]*role="separator"[^>]*>/g);
		expect(divider).toHaveLength(1);
		const codeId = (panels[0] ?? '').match(/\bid="([^"]+)"/)?.[1];
		expect(codeId).toBeTruthy();
		expect(divider[0] ?? '').toContain('aria-label="Resize code and preview"');
		expect(divider[0] ?? '').toContain(`aria-controls="${codeId}"`);
		expect(divider[0] ?? '').toContain('aria-valuenow="64"');
		expect(divider[0] ?? '').toContain('aria-valuemin="25"');
		expect(divider[0] ?? '').toContain('aria-valuemax="80"');
		expect(divider[0] ?? '').toContain('tabindex="0"');
	});

	// Tab triggers rendered inside a resizable panel lose their selection on click once the page resumes.
	it('keeps the file tabs outside the resizable group and the editor panes inside the code panel', async () => {
		const html = await render({
			files: [
				{ name: 'app.tsrx', code: 'export default function App() @{ <p>Hi</p> }' },
				{ name: 'card.tsrx', code: 'export default function Card() @{ <p>Card</p> }' },
			],
			panes: ['app.tsrx', 'card.tsrx'].map((name, index) => ({
				name,
				stem: name.replace('.tsrx', ''),
				ext: '.tsrx',
				tab: index === 0 ? 'first' : name,
				code: '',
				lines: [],
			})),
		});
		const group = html.indexOf(' ui-panels');
		const codePanel = html.search(/<div[^>]*\bui-panel\b[^>]*class="[^"]*\bsource\b/);
		const divider = html.indexOf('role="separator"');
		expect(all(html, /role="tab"/g)).toHaveLength(2);
		expect(html.lastIndexOf('role="tablist"', group)).toBeGreaterThan(-1);
		expect(html.indexOf('role="tablist"', group)).toBe(-1);
		const panes = [...html.matchAll(/role="tabpanel"/g)].map((match) => match.index ?? -1);
		expect(panes).toHaveLength(2);
		for (const at of panes) expect(at > codePanel && at < divider).toBe(true);
	});

	it('names each block’s panels apart, since the names become element ids', async () => {
		const ids = async (code: string) =>
			all(await render(block(code)), /<div[^>]*\bui-panel\b[^>]*>/g).map(
				(panel) => panel.match(/\bid="([^"]+)"/)?.[1],
			);
		const first = await ids('export default function A() @{ <p>A</p> }');
		const second = await ids('export default function B() @{ <p>B</p> }');
		expect(new Set([...first, ...second]).size).toBe(4);
	});
});
