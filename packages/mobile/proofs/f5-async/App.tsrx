import { state } from '@markless/core';

function claim(name: string, wait: number) {
	return new Promise<string>((resolve, reject) => {
		setTimeout(() => {
			if (name === 'admin') reject(new Error('The name admin is taken'));
			else resolve(`Saved ${name}`);
		}, wait);
	});
}

export default function App() @{
	let status = state('Nothing saved');
	<main>
		<h1>Username</h1>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				status = 'Saving';
				try {
					status = await claim(String(data.get('name')), 8000);
				} catch (error) {
					status = (error as Error).message;
				}
			}}
		>
			<input aria-label="Name" name="name" />
			<button type="submit">Save</button>
		</form>
		<p>{status}</p>
	</main>
}
