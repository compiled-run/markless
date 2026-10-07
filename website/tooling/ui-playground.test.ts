import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FamilyMeta } from '../components/docs/ui-meta/index.ts';
import {
	analyzeDemo,
	codePanelChrome,
	codeSlots,
	displaySource,
	playgroundControls,
	playgroundModule,
	type DemoAnalysis,
} from './ui-playground.ts';

it('keeps scenario editing outside the file tabs widget', () => {
	const chrome = codePanelChrome({
		scenario: 'accordion/basic',
		panes: [{ value: 'source', label: 'basic.tsrx', markup: 'source' }],
		bar: '<select.root class="pg-bar-pick">Scenario</select.root>',
		indent: '',
	});
	expect(chrome.indexOf('</select.root>')).toBeLessThan(chrome.indexOf('<tabs.root'));
});

describe('playground source preview', () => {
	it.each([
		[
			'accordion',
			"import { accordion } from '@markless/ui';\n\nexport default function Questions() @{\n\tconst name = 'Shipping';\n\n",
		],
		[
			'collapsible',
			"import { collapsible } from '@markless/ui';\nexport default function Details() @{\n",
		],
	])(
		'starts the %s preview at its root and preserves the complete source for expansion',
		(family, prelude) => {
			const body = `\t<${family}.root>\n\t\tHello\n\t</${family}.root>\n}`;
			const source = prelude + body;
			const demo: DemoAnalysis = {
				family,
				stem: 'basic',
				file: '/site/basic.tsrx',
				source,
				tag: `${family}.root`,
				openingStart: prelude.length + 1,
				openingEnd: prelude.length + body.indexOf('>') + 1,
				selfClosing: false,
				childrenStart: 0,
				childrenEnd: 0,
				closing: `</${family}.root>`,
				attributes: [],
				css: '',
				itemValues: [],
				prelude: '',
			};
			const generated = playgroundModule({
				demo,
				meta: {
					family,
					quick: [],
					showAll: [],
					keyboard: [],
					examples: [],
					presets: [{ name: 'basic', label: 'Basic', values: {} }],
				},
				controls: [],
				slots: [],
				docs: [],
				colourCss: '',
				chromeCss: '',
				sourceLabel: 'basic.tsrx',
				cssLabel: `${family}.css`,
				cssLines: [],
				sourceLines: source.split('\n').map((text, index) => ({
					id: String(index),
					runs: [{ id: String(index), text }],
				})),
			});
			const readLines = (prefix: string) => {
				const match = generated.match(
					new RegExp(`const ${prefix}0: readonly Line\\[\\] = (.*);`),
				);
				expect(match).not.toBeNull();
				return JSON.parse(match![1]).map((line: { runs: { text: string }[] }) =>
					line.runs.map((run) => run.text).join(''),
				);
			};
			const context = readLines('srcContext');
			const preview = readLines('srcLines');
			expect(preview[0]).toBe(`\t<${family}.root>`);
			expect([...context, ...preview].join('\n')).toBe(source);
			expect(generated).toContain('<span class="pg-source-context">');
		},
	);
});

describe('generator controls', () => {
	const dir = mkdtempSync(join(tmpdir(), 'ui-playground-'));
	const demoFile = (name: string, source: string) => {
		const file = join(dir, `${name}.tsrx`);
		writeFileSync(file, source);
		return file;
	};
	const meta = (overrides: Partial<FamilyMeta>): FamilyMeta => ({
		family: 'progress',
		quick: [],
		showAll: [],
		keyboard: [],
		examples: [],
		presets: [{ name: 'basic', label: 'Basic', values: {} }],
		...overrides,
	});
	const generate = (demo: DemoAnalysis, family: FamilyMeta) => {
		const controls = playgroundControls(demo, family);
		const slots = codeSlots(demo, controls);
		return {
			controls,
			slots,
			module: playgroundModule({
				demo,
				meta: family,
				controls,
				slots,
				docs: [],
				colourCss: '',
				chromeCss: '',
				sourceLabel: 'basic.tsrx',
				cssLabel: 'x.css',
				cssLines: [],
				sourceLines: [{ id: '0', runs: [{ id: '0', text: displaySource(demo, slots) }] }],
			}),
		};
	};

	it('draws a number prop as a select whose cell holds a number, and null for its empty option', async () => {
		const file = demoFile(
			'numbers',
			"import { progress } from '@markless/ui';\n\nexport default function Bar() @{\n\t<progress.root value={30}>\n\t\t<progress.track />\n\t</progress.root>;\n}\n",
		);
		const demo = await analyzeDemo('progress', 'numbers', file);
		const family = meta({
			quick: [
				{ part: 'root', prop: 'value' },
				{ part: 'root', prop: 'max' },
			],
			overrides: [
				{ part: 'root', prop: 'value', options: ['', '30', '60'] },
				{ part: 'root', prop: 'max', options: ['100', '200'] },
			],
			presets: [{ name: 'none', label: 'None', values: { value: '', max: '200' } }],
		});
		const { controls, module } = generate(demo, family);
		expect(controls.map((one) => [one.holds, one.nullable, one.seen])).toEqual([
			['number', true, 30],
			['number', false, 100],
		]);
		expect(module).toContain('let cValue = state<number | null>(30);');
		expect(module).toContain("const nextValue = next === '' ? null : Number(next);");
		expect(module).toContain('const nextMax = Number(next);');
		expect(module).toContain('let tValue = state("{30}");');
		expect(module).toContain('"none": { label: "None", cValue: null, cMax: 200 },');
		expect(module).toContain('value={cValue}');
	});

	it('refuses a number prop with no numeric options', async () => {
		const file = demoFile(
			'bare',
			"import { progress } from '@markless/ui';\n\nexport default function Bar() @{\n\t<progress.root value={30} />;\n}\n",
		);
		const demo = await analyzeDemo('progress', 'bare', file);
		expect(() =>
			playgroundControls(demo, meta({ quick: [{ part: 'root', prop: 'max' }] })),
		).toThrow(/numeric options/);
	});

	it('turns a demo const into a cell, cuts its declaration and prints the new literal', async () => {
		const file = demoFile(
			'local',
			"import { computed } from '@markless/core';\nimport { progress } from '@markless/ui';\n\nexport default function Bar() @{\n\tconst amount = 30;\n\tconst label = 'Export';\n\tconst shown = computed(() => amount);\n\n\t<progress.root value={shown}>\n\t\t<progress.label>{label}</progress.label>\n\t</progress.root>;\n}\n",
		);
		const demo = await analyzeDemo('progress', 'local', file);
		const family = meta({
			quick: [
				{ local: 'amount', doc: 'How far.', options: ['30', '90'] },
				{ local: 'label', label: 'Label', doc: 'The name.' },
			],
		});
		const { controls, module } = generate(demo, family);
		expect(controls.map((one) => [one.kind, one.cell, one.holds])).toEqual([
			['select', 'amount', 'number'],
			['textbox', 'label', 'string'],
		]);
		expect(module).toContain('import { computed, state } from');
		expect(module).toContain('let amount = state<number>(30);');
		expect(module).toContain('let label = state<string>("Export");');
		expect(module).toContain('let tlLabel = state("\'Export\'");');
		expect(module).not.toContain('const amount = 30;');
		expect(module).toContain('const shown = computed(() => amount);');
		expect(module).toContain('<textbox.label class="pg-name">Label</textbox.label>');
		expect(module).toContain('value={shown}');
	});

	it('refuses a local the demo does not declare', async () => {
		const file = demoFile(
			'nolocal',
			"import { progress } from '@markless/ui';\n\nexport default function Bar() @{\n\t<progress.root value={30} />;\n}\n",
		);
		const demo = await analyzeDemo('progress', 'nolocal', file);
		expect(() =>
			playgroundControls(demo, meta({ quick: [{ local: 'amount', doc: '' }] })),
		).toThrow(/declares no/);
	});

	it('finds the family root inside a plain wrapper and draws no controls band without controls', async () => {
		const file = demoFile(
			'wrapped',
			'import { progress } from \'@markless/ui\';\n\nexport default function Bar() @{\n\t<div class="desk">\n\t\t<button type="button">Go</button>\n\t\t<progress.root value={30} />\n\n\t\t<style>\n\t\t\t.desk {\n\t\t\t\tdisplay: grid;\n\t\t\t}\n\t\t</style>\n\t</div>;\n}\n',
		);
		const demo = await analyzeDemo('progress', 'wrapped', file);
		expect(demo.tag).toBe('progress.root');
		expect(demo.renderStart).toBeLessThan(demo.openingStart);
		expect(demo.css).toContain('.desk');
		const { module } = generate(demo, meta({}));
		expect(module).not.toContain('pg-controls');
		expect(module).not.toContain('pg-log');
		expect(module).toContain(
			'<div class="desk">\n\t\t<button type="button">Go</button>\n\t\t<progress.root',
		);
		expect(module.slice(module.indexOf('<div class="pg-stage">'))).not.toMatch(
			/<style>\n\t\t\t\.desk/,
		);
	});

	it('names the event log after the callback it counts', async () => {
		const file = demoFile(
			'event',
			'import { radiogroup } from \'@markless/ui\';\n\nexport default function Plans() @{\n\t<radiogroup.root value="a">\n\t\t<radiogroup.item value="a" />\n\t</radiogroup.root>;\n}\n',
		);
		const demo = await analyzeDemo('radiogroup', 'event', file);
		const { module } = generate(
			demo,
			meta({
				family: 'radiogroup',
				quick: [{ part: 'root', prop: 'disabled' }],
				showAll: [{ part: 'root', prop: 'onChange' }],
			}),
		);
		expect(module).toContain('<p class={logClass}>onChange called {events} time(s)</p>');
		expect(module).toContain('<collapsible.trigger class="pg-showall">');
	});

	it("types an event control's parameter through the family namespace when it names the family's own alias", async () => {
		const file = demoFile(
			'alias',
			'import { resizable } from \'@markless/ui\';\n\nexport default function Panes() @{\n\t<resizable.root>\n\t\t<resizable.item value="a" />\n\t</resizable.root>;\n}\n',
		);
		const demo = await analyzeDemo('resizable', 'alias', file);
		const { controls, module } = generate(
			demo,
			meta({ family: 'resizable', showAll: [{ part: 'root', prop: 'onChange' }] }),
		);
		expect(controls[0]?.parameter).toBe('resizable.ResizableSizes');
		expect(module).toContain('onChange={(next: resizable.ResizableSizes) => {');
		expect(module).not.toMatch(/next: ResizableSizes/);
	});

	it('leaves a parameter of plain and global types unqualified', async () => {
		const file = demoFile(
			'plain',
			'import { radiogroup } from \'@markless/ui\';\n\nexport default function Plans() @{\n\t<radiogroup.root value="a" />;\n}\n',
		);
		const demo = await analyzeDemo('radiogroup', 'plain', file);
		const { controls } = generate(
			demo,
			meta({ family: 'radiogroup', showAll: [{ part: 'root', prop: 'onChange' }] }),
		);
		expect(controls[0]?.parameter).toBe('string');
	});

	it('names a control chip with the ui-meta label override', async () => {
		const file = demoFile(
			'label',
			'import { tabs } from \'@markless/ui\';\n\nexport default function Panel() @{\n\t<tabs.root value="a">\n\t\t<tabs.trigger value="a">A</tabs.trigger>\n\t</tabs.root>;\n}\n',
		);
		const demo = await analyzeDemo('tabs', 'label', file);
		const { module } = generate(
			demo,
			meta({
				family: 'tabs',
				quick: [
					{ part: 'root', prop: 'selectOnFocus' },
					{ part: 'root', prop: 'loop' },
					{ part: 'root', prop: 'value' },
				],
				overrides: [
					{ part: 'root', prop: 'selectOnFocus', label: 'Select on focus' },
					{ part: 'root', prop: 'value', label: 'Showing' },
				],
			}),
		);
		expect(module).toContain('<toggle.label class="pg-name">Select on focus</toggle.label>');
		expect(module).toContain('<toggle.label class="pg-name">Loop</toggle.label>');
		expect(module).toContain('<select.label class="pg-name">Showing</select.label>');
		expect(module).not.toContain('SelectOnFocus</toggle.label>');
		expect(module).toContain('aria-label="About selectOnFocus"');
	});

	it('keeps a list-only value a list when Multiple is off, and writes the state cell the demo binds', async () => {
		const file = demoFile(
			'listonly',
			"import { computed, state } from '@markless/core';\nimport { gridlist } from '@markless/ui';\n\nexport default function Files() @{\n\tlet picked = state<readonly string[]>(['a']);\n\tconst shown = computed(() => picked.join(', '));\n\n\t<div class=\"desk\">\n\t\t<gridlist.root selectable value={picked} onChange={(next: readonly string[]) => {\n\t\t\tpicked = next;\n\t\t}}>\n\t\t\t<gridlist.item value=\"a\" />\n\t\t\t<gridlist.item value=\"b\" />\n\t\t</gridlist.root>\n\t\t<p>{shown}</p>\n\t</div>;\n}\n",
		);
		const demo = await analyzeDemo('gridlist', 'listonly', file);
		const { controls, slots, module } = generate(
			demo,
			meta({
				family: 'gridlist',
				quick: [{ part: 'root', prop: 'multiple' }],
				showAll: [
					{ part: 'root', prop: 'value' },
					{ part: 'root', prop: 'onChange' },
				],
				presets: [
					{ name: 'basic', label: 'Basic', values: { multiple: 'false', value: 'a' } },
					{ name: 'two', label: 'Two', values: { multiple: 'true', value: 'a, b' } },
					{ name: 'none', label: 'None', values: { multiple: 'false', value: '' } },
				],
			}),
		);
		const value = controls.find((one) => one.prop === 'value')!;
		expect([value.kind, value.cell, value.listOnly, value.seen, value.options]).toEqual([
			'select',
			'picked',
			true,
			['a'],
			['a', 'b', ''],
		]);
		expect(module).toContain('let picked = state<readonly string[]>(["a"]);');
		expect(module).not.toContain("let picked = state<readonly string[]>(['a']);");
		expect(module).toContain('const shown = computed(() => picked.join');
		expect(module).toContain(
			'const nextValue = next ? heldList(picked) : heldList(picked).slice(0, 1);',
		);
		expect(module).not.toMatch(/heldList\(picked\)\[0\] \?\? ''/);
		expect(module).toContain(
			"const nextValue = next === '' ? [] : cMultiple ? toggled(picked, next) : heldList(picked).includes(next) ? [] : [next];",
		);
		expect(module).toContain('value={picked}');
		expect(module).toContain(
			'{"The rows that are picked, named by the value each gridlist.item was written with. Omit it and nothing starts picked."}',
		);
		expect(module).toContain('"basic": { label: "Basic", cMultiple: false, picked: ["a"] },');
		expect(module).toContain('"two": { label: "Two", cMultiple: true, picked: ["a", "b"] },');
		expect(module).toContain('"none": { label: "None", cMultiple: false, picked: [] },');
		expect(module).toContain('const nextValue = preset["picked"] as readonly string[];');
		expect(slots.find((one) => one.control === value)?.form).toBe('local');
		expect(module).toContain('let tValue = state("[\'a\']");');
		expect(module).toContain('tValue = valueText(nextValue).slice(1, -1);');
		expect(displaySource(demo, slots)).toMatch(/state<readonly string\[\]>\(PGSLOT\d+\)/);
	});

	it('still turns a string-or-list value into one string when Multiple is off', async () => {
		const file = demoFile(
			'either',
			'import { accordion } from \'@markless/ui\';\n\nexport default function Questions() @{\n\t<accordion.root value="a">\n\t\t<accordion.item value="a" />\n\t</accordion.root>;\n}\n',
		);
		const demo = await analyzeDemo('accordion', 'either', file);
		const { controls, module } = generate(
			demo,
			meta({
				family: 'accordion',
				quick: [
					{ part: 'root', prop: 'multiple' },
					{ part: 'root', prop: 'value' },
				],
			}),
		);
		expect(controls[1]?.listOnly).toBeUndefined();
		expect(module).toContain(
			"const nextValue = next ? heldList(cValue) : (heldList(cValue)[0] ?? '');",
		);
		expect(module).toContain('const nextValue = cMultiple ? toggled(cValue, next) : next;');
	});
});
