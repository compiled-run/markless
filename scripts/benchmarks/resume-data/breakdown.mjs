// Splits a page's resume data scripts into their record lists, raw and gzip.
import { gzipSync } from 'node:zlib';

const gzip = (text) => gzipSync(text, { level: 9 }).length;
const DATA_SCRIPT = /<script type="(markless\/(?:state|view))"[^>]*>([\s\S]*?)<\/script>/g;
const LISTS = {
	'markless/state': ['cells', 'computed', 'sharedSeeds', 'sharedDefinitions', 'storage'],
	'markless/view': [
		'locators',
		'events',
		'domUpdates',
		'behaviors',
		'elementHandles',
		'keyedRepeats',
		'branches',
		'asyncBoundaries',
	],
};

export function resumeDataBreakdown(html, decode = (_type, text) => JSON.parse(text)) {
	const total = { raw: 0, gzip: 0 };
	const scripts = {};
	const lists = {};
	for (const [, type, text] of html.matchAll(DATA_SCRIPT)) {
		const raw = Buffer.byteLength(text);
		total.raw += raw;
		scripts[type] = { raw, gzip: gzip(text) };
		const payload = decode(type, text);
		for (const name of LISTS[type]) {
			const list = payload[name];
			if (!Array.isArray(list) || list.length === 0) continue;
			const json = JSON.stringify(list);
			lists[`${type.slice(9)}.${name}`] = {
				records: list.length,
				raw: json.length,
				gzip: gzip(json),
			};
		}
	}
	total.gzip = Object.values(scripts).reduce((t, s) => t + s.gzip, 0);
	return { total, scripts, lists };
}
