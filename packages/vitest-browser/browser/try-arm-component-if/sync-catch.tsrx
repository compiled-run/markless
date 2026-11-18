import { state } from '@markless/core';

async function save(): Promise<void> {
	await new Promise((done) => setTimeout(done, 10));
	throw new Error('Save failed');
}

export default function SyncCatch() @{
	let note = state('Idle');

	<main>
		@try {
			<section>
				<p data-note>{note}</p>
				<button
					data-save
					onClick={async () => {
						note = 'Saving';
						await save();
					}}
				>
					Save
				</button>
			</section>
		} @catch (error, reset) {
			<>
				<p data-error>{error.message}</p>
				<button data-dismiss onClick={reset}>Dismiss</button>
			</>
		}
	</main>
}
