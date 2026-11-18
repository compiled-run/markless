import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import { collectTsrxModuleDiagnostics } from '../src/index.ts';

// A same-file child a keyed row places re-runs its async recipe from the props of the instance the row placed.

const errorCodes = async (source: string) =>
	collectTsrxModuleDiagnostics(
		await compileTsrxModule({ filename: 'src/Ledger.tsrx', source, symbols: [] }),
	)
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);

test('a same-file row child whose async recipe reads the whole row item builds', async () => {
	expect(
		await errorCodes(`
import { computed, state } from '@markless/core';
async function balanceOf(name: string, round: number) { return name + round; }
function Entry({ account, round }: { account: { code: string; name: string }; round: number }) @{
	const balance = computed(async () => await balanceOf(account.name, round));
	<li>{account.code}</li>
}
export default function Ledger() @{
	let round = state(1);
	let accounts = state([{ code: 'x9', name: 'Rent' }]);
	<div>
		@for (const account of accounts; key account.code) { <Entry account={account} round={round} /> }
		<button onClick={() => round++}>Recount</button>
	</div>
}
`),
	).toEqual([]);
});

test('a same-file row child whose async recipe reads a nested field of the row item builds', async () => {
	expect(
		await errorCodes(`
import { computed, state } from '@markless/core';
async function lookUp(city: string, unit: string) { return city + unit; }
export function Forecast({ city, unit }: { city: string; unit: string }) @{
	const temperature = computed(async () => await lookUp(city, unit));
	<p>{city}</p>
}
export default function Weather() @{
	let unit = state('C');
	let places = state([{ id: 4, where: { city: 'Oslo' } }]);
	<section>
		<button onClick={() => (unit = 'F')}>F</button>
		@for (const place of places; key place.id) { <Forecast unit={unit} city={place.where.city} /> }
	</section>
}
`),
	).toEqual([]);
});

const compile = (source: string) =>
	compileTsrxModule({ filename: 'src/Totals.tsrx', source, symbols: [] });

const runnerSource = (result: Awaited<ReturnType<typeof compile>>) =>
	result.symbolModules.modules.find((module) => module.kind === 'async-computed-runner')?.source;

test('a same-file helper holding its own @try, @pending and @catch builds', async () => {
	expect(
		await errorCodes(`
import { computed } from '@markless/core';
async function sum(label: string) { return label.length; }
function Total({ label }: { label: string }) @{
	const total = computed(async () => await sum(label));
	@try { <b>{total}</b> } @pending { <i>adding</i> } @catch { <s>failed</s> }
}
export default function Totals() @{
	<main><Total label="rent" /></main>
}
`),
	).toEqual([]);
});

test('a same-file helper whose @catch reads the error builds', async () => {
	expect(
		await errorCodes(`
import { computed } from '@markless/core';
async function sum(label: string) { return label.length; }
function Tally({ label }: { label: string }) @{
	const total = computed(async () => await sum(label));
	@try { <b>{total}</b> } @catch (error) { <s>{String(error)}</s> }
}
export default function Totals() @{
	<main><Tally label="rent" /></main>
}
`),
	).toEqual([]);
});

test('an async recipe reading a prop every caller passes the same constant reads that constant', async () => {
	const result = await compile(`
import { computed } from '@markless/core';
async function sum(label: string) { return label.length; }
function Total({ label }: { label: string }) @{
	const total = computed(async () => await sum(label));
	@try { <b>{total}</b> } @pending { <i>adding</i> }
}
export default function Totals() @{
	<main><Total label="rent" /></main>
}
`);
	expect(runnerSource(result)).toContain('const label = "rent";');
	expect(result.captureAnalysis.boundResolverRows ?? []).toEqual([]);
});

test('an async recipe whose callers pass different constants reads its own instance', async () => {
	const result = await compile(`
import { computed } from '@markless/core';
async function sum(label: string) { return label.length; }
function Total({ label }: { label: string }) @{
	const total = computed(async () => await sum(label));
	@try { <b>{total}</b> } @pending { <i>adding</i> }
}
export default function Totals() @{
	<main><Total label="rent" /><Total label="food" /></main>
}
`);
	expect(runnerSource(result)).toContain('context.capture.read(');
	expect(
		(result.captureAnalysis.boundResolverRows ?? []).map((row) => row.instancePath),
	).toEqual(['c0:', 'c1:']);
});

test('an async recipe rebuilds a row item from the member reads its slots answer', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
async function balanceOf(name: string, id: string) { return name + id; }
function Entry({ account, round }: { account: { id: string; owner: { name: string } }; round: number }) @{
	const balance = computed(async () => await balanceOf(account.owner.name, account.id + round));
	<li>@try { <b>{balance}</b> } @pending { <i>counting</i> }</li>
}
export default function Ledger() @{
	let round = state(1);
	let accounts = state([{ id: 'x9', owner: { name: 'Rent' } }]);
	<div>
		@for (const account of accounts; key account.id) { <Entry account={account} round={round} /> }
		<button onClick={() => round++}>Recount</button>
	</div>
}
`);
	expect(runnerSource(result)).toMatch(
		/const account = \{ "owner": \{ "name": context\.capture\.read\("[^"]+"\) \}, "id": context\.capture\.read\("[^"]+"\) \};/,
	);
});
