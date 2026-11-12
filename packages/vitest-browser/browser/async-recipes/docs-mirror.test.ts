import { expect, test } from 'vitest';
import page from '../../../../website/pages/concepts/async.mdx?raw';
import conditionalsPage from '../../../../website/pages/concepts/conditionals.mdx?raw';
import profile from '../concept-docs/profile.tsrx?raw';
import ticker from '../concept-docs/ticker.tsrx?raw';
import citySearch from './city-search.tsrx?raw';
import feed from './feed.tsrx?raw';
import inbox from './inbox.tsrx?raw';
import mugs from './mugs.tsrx?raw';
import mugsHelpers from './mugs.ts?raw';
import nickname from './nickname.tsrx?raw';
import nicknameHelpers from './nickname.ts?raw';
import oneSave from './one-save.tsrx?raw';
import orders from './orders.tsrx?raw';
import pause from './pause.ts?raw';
import retry from './retry.ts?raw';
import backoff from './backoff.tsrx?raw';
import returning from './returning.ts?raw';
import timeout from './timeout.tsrx?raw';

// The Async and Conditionals pages' examples are these tested files, shown whole; only the fetch stand-ins beside them differ.
const shown: ReadonlyArray<readonly [name: string, language: string, source: string, times: number, mdx?: string]> = [
	['mugs.tsrx', 'tsrx', mugs, 1],
	['mugs.ts', 'ts', mugsHelpers, 1],
	['backoff.tsrx', 'tsrx', backoff, 1],
	['retry.ts', 'ts', retry, 1],
	['inbox.tsrx', 'tsrx', inbox, 1],
	['returning.ts', 'ts', returning, 1],
	['timeout.tsrx', 'tsrx', timeout, 1],
	['orders.tsrx', 'tsrx', orders, 1],
	['feed.tsrx', 'tsrx', feed, 1],
	['city-search.tsrx', 'tsrx', citySearch, 1],
	['pause.ts', 'ts', pause, 1],
	['nickname.tsrx', 'tsrx', nickname, 1],
	['nickname.ts', 'ts', nicknameHelpers, 1],
	['one-save.tsrx', 'tsrx', oneSave, 1],
	['profile.tsrx', 'tsrx', profile, 1],
	['ticker.tsrx', 'tsrx', ticker, 1, conditionalsPage],
];

for (const [name, language, source, times, mdx = page] of shown) {
	test(`the ${mdx === page ? 'Async' : 'Conditionals'} page shows ${name} exactly as tested`, () => {
		const fence = `\`\`\`${language} title="${name}"\n`;
		const blocks = mdx.split(fence).slice(1).map((rest) => rest.slice(0, rest.indexOf('```\n')));
		expect(blocks).toEqual(Array.from({ length: times }, () => source));
	});
}
