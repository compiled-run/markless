// Byte census of one served page: document, <pre> blocks, inline payload, and
// the state + view bytes each island accounts for (records are prefixed `m<N>:`).
//   node .witness-s1/measure.mjs /tmp/page.html
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const file = process.argv[2] ?? '.output/public/markless/ui/accordion/index.html';
const html = readFileSync(file, 'utf8');
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const all = (re) => [...html.matchAll(re)];
const sum = (list) => list.reduce((n, s) => n + bytes(s), 0);

const pres = all(/<pre[\s\S]*?<\/pre>/g).map((m) => m[0]);
const state = all(/<script type="markless\/state"[^>]*>([\s\S]*?)<\/script>/g);
const view = all(/<script type="markless\/view"[^>]*>([\s\S]*?)<\/script>/g);
const scripts = all(/<script[\s\S]*?<\/script>/g).map((m) => m[0]);
const hovers = all(/<span class="tsrx-hover[" ]/g).length;
const spans = all(/<span[ >]/g).length;
const comments = all(/<!--markless-slot:\d+-->/g).length;
const mk = all(/\bmk-[a-z0-9]+/g).length;
const ariaLabel = sum(all(/ aria-label="[^"]*"/g).map((m) => m[0]));
const tips = sum(all(/<span class="tsrx-tip[" ][\s\S]*?<\/span><\/span>/g).map((m) => m[0]));
const panels = all(/data-scenario="([^"]*)"/g).map((m) => m[1]);
const docs = all(/class="cp-doc[" ]/g).length;
const docBytes = sum(all(/<span class="cp-docs[\s\S]*?<\/span>\s*<\/span>\s*<\/span>/g).map((m) => m[0]));

const textOf = (s) =>
	s
		.replace(/<[^>]+>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#\d+;/g, 'x');

// Per-island attribution: every record names its island in an `m<N>:` prefix.
const islands = new Map();
const add = (key, record, side) => {
	const id = record.graphNodeId ?? record.id ?? record.hostNodeId ?? record.handleId ?? '';
	const found = /^(m\d+):/.exec(String(id));
	const island = found ? found[1] : 'none';
	const entry = islands.get(island) ?? { state: 0, view: 0, defs: new Set() };
	entry[side] += JSON.stringify(record).length;
	const definition = /shared:[^#]*#(\w+)/.exec(String(record.id ?? record.graphNodeId ?? ''));
	if (definition && key === 'sharedDefinitions') entry.defs.add(definition[1]);
	islands.set(island, entry);
};
for (const match of state) {
	const parsed = JSON.parse(match[1]);
	for (const key of ['cells', 'computed', 'sharedSeeds', 'sharedDefinitions'])
		for (const record of parsed[key] ?? []) add(key, record, 'state');
}
for (const match of view) {
	const parsed = JSON.parse(match[1]);
	for (const key of ['locators', 'events', 'domUpdates', 'behaviors', 'elementHandles', 'asyncBoundaries'])
		for (const record of parsed[key] ?? []) add(key, record, 'view');
}
const islandRows = [...islands]
	.sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))
	.map(([island, entry]) => ({
		island,
		state: entry.state,
		view: entry.view,
		total: entry.state + entry.view,
		defs: [...entry.defs].sort().join(','),
	}));
const codePanels = islandRows.filter((row) => row.defs.startsWith('collapsibleState,tabs') && !/accordion/.test(row.defs));

console.log(
	JSON.stringify(
		{
			file,
			document: bytes(html),
			documentGzip: gzipSync(html).length,
			preCount: pres.length,
			preBytes: sum(pres),
			preText: pres.reduce((n, p) => n + bytes(textOf(p)), 0),
			preGzip: gzipSync(pres.join('')).length,
			stateBytes: sum(state.map((m) => m[0])),
			viewBytes: sum(view.map((m) => m[0])),
			allScriptBytes: sum(scripts),
			nonScriptBytes: bytes(html) - sum(scripts),
			hoverSpans: hovers,
			ariaLabelBytes: ariaLabel,
			tipBytes: tips,
			spanTags: spans,
			slotComments: comments,
			mkStamps: mk,
			panels,
			docRegistryEntries: docs,
			docRegistryBytes: docBytes,
			islands: islandRows.length,
			codePanelIslands: codePanels.map((row) => `${row.island}: state ${row.state} + view ${row.view} = ${row.total}`),
			codePanelPayloadTotal: codePanels.reduce((n, row) => n + row.total, 0),
			islandTable: islandRows.map((row) => `${row.island} ${row.total} [${row.defs}]`),
		},
		null,
		2,
	),
);
