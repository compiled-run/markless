import { state } from '@markless/core';

export default function App() @{
	let log = state('none');
	<main>
		<h1>Pointer</h1>
		<div
			data-name="Card"
			onPointerover={(event) => {
				const names: string[] = [];
				for (const element of [event.target, event.currentTarget])
					names.push((element as HTMLElement).getAttribute('data-name') ?? '?');
				const came = event.relatedTarget as Node | null;
				const card = event.currentTarget as HTMLElement;
				log = `${names.join(' in ')} from ${came !== null && card.contains(came) ? 'inside' : 'outside'}`;
			}}
		>
			<p data-name="Title">Title</p>
			<p data-name="Body">Body</p>
		</div>
		<button onClick={() => (log = 'none')}>Reset</button>
		<p>Last {log}</p>
	</main>
}
