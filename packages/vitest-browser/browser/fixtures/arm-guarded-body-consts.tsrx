import { state } from '@markless/core';

const HEADS: Record<string, { readonly title: string; readonly description: string }> = {
	'/guide': { title: 'Guide', description: 'Read the guide' },
};

const PEOPLE: Record<string, { readonly name: string; readonly role: { readonly label: string } }> = {
	ada: { name: 'Ada', role: { label: 'Engineer' } },
};

function Head({ path }: { path: string }) @{
	const docs = HEADS[path] ?? (path === '/' ? undefined : HEADS['/missing']);
	<header data-head={path}>
		@if (docs) {
			<>
				<h2 data-title>{docs.title}</h2>
				<meta name="description" content={docs.description} />
			</>
		} @else {
			<>
				<h2 data-title>Home</h2>
			</>
		}
	</header>
}

function Card({ who }: { who?: string }) @{
	const person = who ? PEOPLE[who] : undefined;
	<article data-card={who ?? 'nobody'}>
		@if (person) {
			<p data-role title={person.role.label}>{person.name}</p>
		} @else {
			<p data-role>none</p>
		}
	</article>
}

function Picker() @{
	let picked = state<string | null>(null);
	const person = PEOPLE[picked ?? ''];
	<section data-picker>
		<button type="button" data-pick onClick={() => (picked = picked ? null : 'ada')}>Pick</button>
		@if (picked) {
			<>
				<span data-picked title={person.role.label}>{person.name}</span>
			</>
		}
	</section>
}

export default function ArmGuardedBodyConsts() @{
	<main>
		<Head path="/" />
		<Head path="/guide" />
		<Card />
		<Card who="ada" />
		<Picker />
	</main>
}
