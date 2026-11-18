import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const unrunnableTry = (name: string, list: string) =>
	`@try { @for (const ${name} of props.${list}; key ${name}) { <span>{${name}}</span> } } @pending { <i>Waiting</i> } @catch { <i>Broken</i> }`;
const runnableTry = (value: string) =>
	`@try { <b>{${value}.title}</b> } @pending { <i>Waiting</i> } @catch { <i>Broken</i> }`;

test.each([
	{
		name: 'unrunnable @try in the later, exported component',
		source: `
import { computed } from '@markless/core';
import { loadShelf } from './shelf.ts';
function Ledger() @{
	const shelf = computed(async () => loadShelf());
	<aside>${runnableTry('shelf')}</aside>
}
export function Atlas(props) @{
	<section>${unrunnableTry('page', 'pages')}</section>
}
`,
		marker: 'page of',
	},
	{
		name: 'unrunnable @try in the earlier, non-exported component',
		source: `
import { computed } from '@markless/core';
import { loadCrate } from './crate.ts';
function Manifest(props) @{
	<ol>${unrunnableTry('line', 'lines')}</ol>
}
export function Dock() @{
	const crate = computed(async () => loadCrate());
	<main>${runnableTry('crate')}<p>dock</p></main>
}
`,
		marker: 'line of',
	},
	{
		name: 'second @try of the exported component after another component',
		source: `
import { computed } from '@markless/core';
import { loadOrbit } from './orbit.ts';
function Beacon() @{
	const orbit = computed(async () => loadOrbit());
	<div>${runnableTry('orbit')}</div>
}
export function Station(props) @{
	const orbit = computed(async () => loadOrbit());
	<div><header>${runnableTry('orbit')}</header><ul>${unrunnableTry('bay', 'bays')}</ul></div>
}
`,
		marker: 'bay of',
	},
])('the no-runner @try error points at its own @try ($name)', async ({ source, marker }) => {
	const result = await compileTsrxModule({ filename: 'src/Scene.tsrx', source, symbols: [] });
	const expectedStart = source.lastIndexOf('@try', source.indexOf(marker));
	const sites = result.publicRenderPlan.diagnostics
		.filter((diagnostic) => diagnostic.code === 'MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT')
		.map((diagnostic) => diagnostic.primarySpan?.start);
	expect(sites).toEqual([expectedStart]);
});
