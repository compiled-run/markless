import { state } from '@markless/core';

const TAGS = ['Work', 'Home', 'Ideas'];

export default function App() @{
	let tag = state('Home');
	let sent = state('Nothing sent');
	<main>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Sent ${String(data.get('tag'))} at ${String(data.get('size'))}`;
			}}
		>
			<select name="tag" aria-label="Tag">
				@for (const option of TAGS; key option) {
					<option value={option} selected={option === tag}>
						{option}
					</option>
				}
			</select>
			<select name="size" aria-label="Size">
				<option value="s">Small</option>
				<option value="m" disabled>
					Medium
				</option>
				<option value="l">Large</option>
			</select>
			<button>Send</button>
		</form>
		<button onClick={() => (tag = 'Ideas')}>Use the last tag</button>
		<p>{sent}</p>
	</main>
}
