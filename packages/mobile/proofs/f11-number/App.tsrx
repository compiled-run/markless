import { state } from '@markless/core';

export default function App() @{
	let typed = state('nothing');
	let saved = state('Not saved');
	<main>
		<h1>Settings</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				saved = `Saved size ${String(data.get('size'))}, gap ${String(data.get('gap'))}`;
			}}
		>
			<input
				type="number"
				aria-label="Font size"
				name="size"
				min="14"
				step="1"
				value="16"
				onInput={(event) => (typed = event.currentTarget.value === '' ? 'no number' : event.currentTarget.value)}
			/>
			<input
				type="number"
				aria-label="Spacing"
				name="gap"
				min="0"
				max="10"
				step="0.5"
				onInput={(event) => (typed = event.currentTarget.value === '' ? 'no number' : event.currentTarget.value)}
			/>
			<button>Save</button>
		</form>
		<p>Typed {typed}</p>
		<p>{saved}</p>
	</main>
}
