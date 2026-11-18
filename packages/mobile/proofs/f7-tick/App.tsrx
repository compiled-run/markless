import { state } from '@markless/core';

export default function App() @{
	let news = state(false);
	let agreed = state(true);
	let size = state('M');
	let sent = state('Nothing ordered');
	<main>
		<h1>Order</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `news ${String(data.get('news'))}, size ${String(data.get('size'))}, terms ${String(data.get('terms'))}`;
			}}
		>
			<input
				type="checkbox"
				aria-label="Newsletter"
				name="news"
				onChange={(event) => (news = event.currentTarget.checked)}
			/>
			<input
				type="checkbox"
				aria-label="Accept the terms"
				name="terms"
				value="yes"
				required
				checked
				onChange={(event) => (agreed = event.currentTarget.checked)}
			/>
			<input type="radio" aria-label="Small" name="size" value="S" onChange={() => (size = 'S')} />
			<input type="radio" aria-label="Medium" name="size" value="M" checked onChange={() => (size = 'M')} />
			<input type="radio" aria-label="Large" name="size" value="L" onChange={() => (size = 'L')} />
			<button>Place order</button>
		</form>
		<p>{news ? 'Newsletter on' : 'Newsletter off'}</p>
		<p>{agreed ? 'Terms accepted' : 'Terms not accepted'}</p>
		<p>Size {size}</p>
		<p>{sent}</p>
	</main>
}
