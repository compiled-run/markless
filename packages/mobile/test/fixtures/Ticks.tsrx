import { state } from '@markless/core';

export default function Ticks() @{
	let note = state('');
	let forced = state(false);
	<main>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				note = `${String(data.get('news'))} ${String(data.get('size'))}`;
			}}
		>
			<input type="checkbox" aria-label="News" name="news" checked={forced} onChange={(event) => (note = String(event.currentTarget.checked))} />
			<input type="radio" aria-label="Small" name="size" value="S" required onChange={() => (note = 'S')} />
			<input type="radio" aria-label="Large" name="size" value="L" onChange={() => (note = 'L')} />
			<button>Send</button>
		</form>
		<button onClick={() => (forced = !forced)}>Force</button>
		<input type="radio" aria-label="Other small" name="size" />
		<input type="radio" aria-label="Other large" name="size" checked />
		<p>{note}</p>
	</main>
}
