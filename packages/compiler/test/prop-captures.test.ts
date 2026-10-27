import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const results = `
import { computed, state } from '@markless/core';

export function Results({ query }: { query: string }) @{
	let attempt = state(0);
	const results = computed(async () => {
		const q = query;
		await null;
		return { q };
	});

	@try {
		<ul aria-busy={results.q !== query || attempt > 0}>{results.q}</ul>
	} @catch {
		<button onClick={() => (attempt = attempt + 1)}>Try again</button>
	}
}
`;

const search = `
export function Search() @{
	let query = state('');

	<>
		<input value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<Results query={query} />
	</>
}
`;

async function definitions(source: string) {
	const result = await compileTsrxModule({ filename: 'src/search.tsrx', source, symbols: [] });
	return result.publicRenderModule.componentDefinitions as ReadonlyArray<{
		readonly name: string;
		readonly propCaptures?: Readonly<Record<string, ReadonlyArray<string>>>;
	}>;
}

test('a child composed in its own module names the prop each derive capture slot reads', async () => {
	const byName = new Map(
		(await definitions(results + search)).map((definition) => [definition.name, definition]),
	);
	expect(byName.get('Results')?.propCaptures).toEqual({
		'capture-slot:prop:Results:query#0': ['query'],
	});
	expect(byName.get('Search')?.propCaptures).toBeUndefined();
});

test('a component its module does not compose carries no prop captures', async () => {
	for (const definition of await definitions(results))
		expect(definition.propCaptures, definition.name).toBeUndefined();
});
