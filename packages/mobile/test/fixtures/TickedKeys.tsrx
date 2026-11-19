import { state } from '@markless/core';

export default function TickedKeys() @{
	let note = state('none');
	let focused = state('nothing');
	<main>
		<input
			type="radio"
			aria-label="Small"
			name="size"
			onFocus={() => (focused = 'small')}
			onKeyDown={() => (note = 'key')}
			onChange={() => (note = 'small')}
		/>
		<input type="radio" aria-label="Large" name="size" onBlur={() => (focused = 'left')} onChange={() => (note = 'large')} />
		<input type="checkbox" aria-label="News" onFocus={() => (focused = 'news')} onChange={(event) => (note = `news ${String(event.currentTarget.checked)}`)} />
		<p>{note}</p>
		<p>{focused}</p>
	</main>
}
