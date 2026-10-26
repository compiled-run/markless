import { state } from '@markless/core';

const hold = (): Promise<void> =>
	new Promise((resolve) => {
		((globalThis as { __heldInputs?: Array<() => void> }).__heldInputs ??= []).push(resolve);
	});

export default function AsyncInputPage() @{
	let log = state('');
	let owner = state('');
	<main>
		<section data-name="outer" onClick={(event) => (owner = (event.currentTarget as HTMLElement).dataset.name ?? '')}>
			<button type="button" data-inner>inner</button>
		</section>
		<p data-owner>{owner}</p>
		<input
			data-field
			onInput={async (event) => {
				const value = (event.currentTarget as HTMLInputElement).value;
				await hold();
				log = `${log} ${value}`;
			}}
		/>
		<p data-log>{log}</p>
	</main>
}
