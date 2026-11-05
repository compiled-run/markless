import { state } from '@markless/core';

export default function ForDestructured() @{
	let votes = state<[string, number][]>([
		['pizza', 2],
		['tacos', 1],
	]);
	let people = state([
		{ id: 'ada', name: { first: 'Ada' }, tags: ['math'] },
		{ id: 'bo', name: { first: 'Bo' }, tags: ['art', 'film'] },
	]);

	<section>
		<ul>
			@for (const [dish, n] of votes; key dish) {
				<li data-vote={dish}>{dish + ':' + n}</li>
			}
		</ul>
		<ul>
			@for (const { id, name: { first }, tags: [tag] } of people; index at; key id) {
				<li data-person={id} title={first}>{at + 1}. {first} ({tag})</li>
			}
		</ul>
		<button data-vote-pizza onClick={() => { for (const vote of votes) if (vote[0] === 'pizza') vote[1]++; }}>vote</button>
		<button data-add-sushi onClick={() => votes.push(['sushi', 1])}>sushi</button>
		<button data-rename onClick={() => { for (const p of people) if (p.id === 'bo') p.name = { first: 'Bea' }; }}>rename</button>
		<button data-add-person onClick={() => people.push({ id: 'cy', name: { first: 'Cy' }, tags: ['law'] })}>add</button>
		<button data-reverse onClick={() => people.reverse()}>reverse</button>
	</section>
}
