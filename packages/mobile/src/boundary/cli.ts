import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXTENSIONS, REASON_GROUPS, type Extension, type ReasonGroup } from './classify.ts';
import { measure, type Measured } from './measure.ts';

const repo = resolve(import.meta.dirname, '../../../..');
const out = process.argv[2];
const { items, failures } = await measure(repo);

const groupsOf = (item: Measured) => [...new Set(item.verdict?.reasons.map((reason) => reason.split(':')[0] as ReasonGroup))];
const count = <K extends string>(list: ReadonlyArray<Measured>, keys: (item: Measured) => ReadonlyArray<K>) => {
	const counts: Partial<Record<K, number>> = {};
	for (const item of list) for (const key of keys(item)) counts[key] = (counts[key] ?? 0) + 1;
	return Object.fromEntries(Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number))) as Record<K, number>;
};

const handlers = items.filter((item) => item.kind === 'handler');
const apps = [...new Set(handlers.map((item) => item.app))];
const tally = (list: ReadonlyArray<Measured>) => ({
	handlers: list.length,
	noInlineBody: list.filter((item) => !item.verdict).length,
	dataToday: list.filter((item) => item.verdict?.class === 1).length,
	withExtensions: list.filter((item) => item.verdict?.class === 2).length,
	generalJavaScript: list.filter((item) => item.verdict?.class === 3).length,
	generalJavaScriptOffThePage: list.filter((item) => item.verdict?.class === 3 && !groupsOf(item).some((group) => group === 'browser' || group === 'objects')).length,
	eventOutsideVocabulary: list.filter((item) => item.verdict?.eventOutsideVocabulary).length,
});

const report = {
	note: 'Written by `node packages/mobile/src/boundary/cli.ts`; classes from the analyzer native facts (handler statements and their gaps).',
	failures,
	total: tally(handlers),
	totalWithoutDocsFigures: tally(handlers.filter((item) => item.app !== 'website (docs figures)')),
	perApp: Object.fromEntries(apps.map((app) => [app, tally(handlers.filter((item) => item.app === app))])),
	extensions: Object.fromEntries(
		(Object.keys(EXTENSIONS) as Extension[]).map((extension) => {
			const needing = handlers.filter((item) => item.verdict?.class === 2 && item.verdict.extensions.includes(extension));
			return [
				extension,
				{
					what: EXTENSIONS[extension],
					neededByClass2: needing.length,
					onlyMissingPiece: needing.filter((item) => item.verdict!.extensions.length === 1).length,
					neededByClass3: handlers.filter((item) => item.verdict?.class === 3 && item.verdict.extensions.includes(extension)).length,
				},
			];
		}),
	),
	reasonGroups: Object.fromEntries(
		Object.entries(count(handlers, groupsOf)).map(([group, n]) => [
			group,
			{ what: REASON_GROUPS[group as ReasonGroup], handlers: n, onlyReason: handlers.filter((item) => groupsOf(item).length === 1 && groupsOf(item)[0] === group).length },
		]),
	),
	reasonDetails: count(handlers, (item) => item.verdict?.reasons ?? []),
	computeds: {
		total: items.filter((item) => item.kind === 'computed').length,
		dataToday: items.filter((item) => item.kind === 'computed' && item.verdict?.class === 1).length,
		withExtensions: items.filter((item) => item.kind === 'computed' && item.verdict?.class === 2).length,
		generalJavaScript: items.filter((item) => item.kind === 'computed' && item.verdict?.class === 3).length,
	},
	generalJavaScriptHandlers: handlers
		.filter((item) => item.verdict?.class === 3)
		.map((item) => ({ at: `${item.file}:${item.line}`, event: item.event, reasons: item.verdict!.reasons })),
};

const json = `${JSON.stringify(report, null, '\t')}\n`;
if (out) writeFileSync(out, json);
else process.stdout.write(json);
