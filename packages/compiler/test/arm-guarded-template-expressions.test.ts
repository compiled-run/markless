import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A computed is derived wherever its inputs move, shown or not, so an expression an arm shows holds only under its arm's tests.
async function lifted(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
	return result.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
}

test('an expression an @if arm shows is only computed while the arm test holds', async () => {
	const bindings = await lifted(`
import { computed, storage } from '@markless/core';

export default function Guarded() @{
	let saved = storage('guarded', '{"title":"First"}');
	const note = computed(() => (saved ? (JSON.parse(saved) as { title: string }) : undefined));

	<main>
		@if (note) {
			<h1>{note.title.toUpperCase()}</h1>
		} @else {
			<p>Deleted</p>
		}
	</main>
}`);
	expect(bindings.map((binding) => binding.functionSource)).toEqual([
		'() => ((note)) ? note.title.toUpperCase() : undefined',
	]);
	expect(
		bindings[0]!.dependencies?.map((dependency) => [dependency.source, dependency.armGuard]),
	).toEqual([
		['note.title', undefined],
		['note', true],
	]);
});

test('expressions an @else arm and a nested @switch case show carry every enclosing test', async () => {
	const bindings = await lifted(`
import { state } from '@markless/core';

export function Profile() @{
	let person = state<{ name: { first: string }; age: number } | null>(null);
	let view = state('short');

	<article>
		@if (!person) {
			<em>Nobody</em>
		} @else {
			<dl data-age={person.age.toFixed(0)}>
				@switch (view) {
					@case 'short': {
						<dt>{person.name.first.charAt(0)}</dt>
					}
					@default: {
						<dd>{person.name.first.toUpperCase()} is {String(person.age + 1)}</dd>
					}
				}
			</dl>
		}
	</article>
}`);
	expect(bindings.map((binding) => binding.functionSource)).toEqual([
		'() => !person',
		'() => (!(!person)) ? person.age.toFixed(0) : undefined',
		"() => (!(!person) && (view) === ('short')) ? person.name.first.charAt(0) : undefined",
		"() => (!(!person) && !((view) === ('short'))) ? `${(person.name.first.toUpperCase()) ?? ''} is ${(String(person.age + 1)) ?? ''}` : undefined",
		"() => (!(!person) && !((view) === ('short'))) ? person.name.first.toUpperCase() : undefined",
		"() => (!(!person) && !((view) === ('short'))) ? String(person.age + 1) : undefined",
	]);
	for (const binding of bindings.slice(1))
		expect(
			binding.dependencies
				?.filter((dependency) => dependency.armGuard)
				.map((dependency) => dependency.source),
		).toEqual(binding.functionSource?.includes('view') ? ['person', 'view'] : ['person']);
});
