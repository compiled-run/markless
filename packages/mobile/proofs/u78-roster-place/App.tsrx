import { computed, element, shared, state } from '@markless/core';

const trackState = shared(
	() => {
		const track = state({ current: 0 });
		const stopEls = element<HTMLLIElement[]>();
		return {
			...track,
			stopEls,
			next() {
				track.current = track.current + 1;
			},
		};
	},
	{ scope: 'subtree' },
);

function Stop({ name }: { readonly name: string }) @{
	const track = trackState();
	const mine = element<HTMLLIElement>();
	const at = computed(() => track.stopEls.indexOf(mine as HTMLLIElement));
	const isHere = computed(() => {
		const on = track.current;
		return on === at;
	});
	<li el={[track.stopEls, mine]}>
		<p>{name} is stop {at + 1}</p>
		<p hidden={isHere !== true}>{name} is next</p>
	</li>
}

function Route() @{
	const track = trackState();
	<section>
		<button onClick={() => track.next()}>Next stop</button>
		<ol>
			<Stop name="Harbour" />
			<Stop name="Market" />
			<Stop name="Station" />
		</ol>
	</section>
}

export default function App() @{
	<main>
		<h1>Bus route</h1>
		<Route />
	</main>
}
