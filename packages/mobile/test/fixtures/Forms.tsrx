import { state } from '@markless/core';

function later(name: string, wait: number) {
	return new Promise<string>((resolve, reject) => {
		setTimeout(() => {
			if (name === '') reject(new Error('No name'));
			else resolve(`Kept ${name}`);
		}, wait);
	});
}

export default function Forms() @{
	let draft = state('Bo');
	let agreed = state(false);
	let sent = state('');
	let pressed = state(0);
	let status = state('Idle');
	<main>
		<form
			novalidate={false}
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `${String(data.get('first'))}|${String(data.get('nick'))}|${String(data.get('code'))}|${String(data.get('kind'))}|${String(data.get('agree'))}|${data.getAll('first').length}|${String(data.has('off'))}`;
			}}
		>
			<input aria-label="First" name="first" value="Ada" required />
			<input aria-label="Nick" name="nick" value={draft} onInput={(event) => (draft = event.currentTarget.value)} />
			<input aria-label="Unnamed" />
			<input aria-label="Code" name="code" value="X" required disabled />
			<input type="hidden" name="kind" value="person" />
			<input type="checkbox" aria-hidden="true" tabindex={-1} name="agree" required checked={agreed} />
			<input type="checkbox" aria-hidden="true" name="off" value="yes" />
			<button onClick={() => (pressed = pressed + 1)}>Send</button>
			<button type="submit" formnovalidate>Send anyway</button>
			<button type="button" onClick={() => (agreed = !agreed)}>Agree</button>
		</form>
		<p>{sent}</p>
		<p>{pressed}</p>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				sent = `search ${String(new FormData(event.currentTarget).get('q'))}`;
			}}
		>
			<input aria-label="Search" name="q" />
		</form>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				sent = 'two fields';
			}}
		>
			<input aria-label="A" name="a" />
			<input aria-label="B" name="b" />
		</form>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				status = 'Saving';
				try {
					status = await later(String(data.get('who')), 100);
				} catch (error) {
					status = (error as Error).message;
				} finally {
					pressed = pressed + 10;
				}
			}}
		>
			<input aria-label="Who" name="who" />
			<button>Save</button>
		</form>
		<p>{status}</p>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				status = await later('mine', 50);
			}}
		>
			<button aria-disabled="false">Mine</button>
		</form>
	</main>
}
