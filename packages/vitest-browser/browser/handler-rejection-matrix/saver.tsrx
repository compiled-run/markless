import { state } from '@markless/core';
import { save } from './api.ts';

export function Saver() @{
	let note = state('');
	<form
		onSubmit={async (event) => {
			event.preventDefault();
			note = 'sending';
			await save();
			note = 'saved';
		}}
	>
		<p data-note>{note}</p>
		<button type="submit" data-submit>Save</button>
		<button
			type="button"
			data-click
			onClick={async () => {
				note = 'sending';
				await save();
				note = 'saved';
			}}
		>
			Save by click
		</button>
	</form>
}

export function CaughtSaver() @{
	let note = state('');
	@try {
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				note = 'sending';
				await save();
				note = 'saved';
			}}
		>
			<p data-note>{note}</p>
			<button type="submit" data-submit>Save</button>
			<button
				type="button"
				data-click
				onClick={async () => {
					note = 'sending';
					await save();
					note = 'saved';
				}}
			>
				Save by click
			</button>
		</form>
	} @catch (error, reset) {
		<>
			<p data-caught>caught: {error.message}</p>
			<button type="button" data-reset onClick={() => reset()}>Dismiss</button>
		</>
	}
}
