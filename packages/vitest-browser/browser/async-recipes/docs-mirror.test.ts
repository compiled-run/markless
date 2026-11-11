import { expect, test } from 'vitest';
import page from '../../../../website/pages/concepts/async.mdx?raw';
import citySearch from './city-search.tsrx?raw';
import feed from './feed.tsrx?raw';
import inbox from './inbox.tsrx?raw';
import orders from './orders.tsrx?raw';
import pause from './pause.ts?raw';
import backoff from './backoff.tsrx?raw';
import returning from './returning.ts?raw';
import timeout from './timeout.tsrx?raw';

// The Async page's recipes are these tested files, shown whole; only the fetch stand-ins beside them differ.
const shown: ReadonlyArray<readonly [name: string, language: string, source: string, times: number]> = [
	['backoff.tsrx', 'tsrx', backoff, 1],
	['inbox.tsrx', 'tsrx', inbox, 1],
	['returning.ts', 'ts', returning, 1],
	['timeout.tsrx', 'tsrx', timeout, 1],
	['orders.tsrx', 'tsrx', orders, 1],
	['feed.tsrx', 'tsrx', feed, 1],
	['city-search.tsrx', 'tsrx', citySearch, 1],
	['pause.ts', 'ts', pause, 2],
];

for (const [name, language, source, times] of shown) {
	test(`the Async page shows ${name} exactly as tested`, () => {
		const fence = `\`\`\`${language} title="${name}"\n`;
		const blocks = page.split(fence).slice(1).map((rest) => rest.slice(0, rest.indexOf('```\n')));
		expect(blocks).toEqual(Array.from({ length: times }, () => source));
	});
}
