import { state } from '@markless/core';

export default function App() @{
	let status = state('Not saved');
	let check = state('Not checked');
	<main>
		<h1>Draft</h1>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				status = 'Saving';
				await new Promise((done) => setTimeout(done));
				status = 'Uploading';
				await new Promise((done) => setTimeout(done, 6000));
				status = 'Saved';
			}}
		>
			<button type="submit">Save</button>
		</form>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				check = 'Checking';
				try {
					await new Promise<void>((finish, fail) => {
						setTimeout(fail, 6000);
					});
					check = 'Name free';
				} catch {
					check = 'Name taken';
				}
			}}
		>
			<button type="submit">Check name</button>
		</form>
		<p>{status}</p>
		<p>{check}</p>
	</main>
}
