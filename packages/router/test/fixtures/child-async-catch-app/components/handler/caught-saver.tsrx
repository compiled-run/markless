import { state } from '@markless/core';
import { save } from '../../lib/save.ts';

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
			<p class="note">{note}</p>
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
			<p class="caught">caught: {error.message}</p>
			<button type="button" data-reset onClick={() => reset()}>Dismiss</button>
		</>
	}
}

export function StaticCaughtSaver() @{
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
			<p class="note">{note}</p>
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
	} @catch (error) {
		<p class="caught">caught: {error.message}</p>
	}
}

export function LabelledCaughtSaver({ label }: { readonly label: string }) @{
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
			<p class="note">{note}</p>
			<p class="label">{label}</p>
			<button type="submit" data-submit>Save</button>
		</form>
	} @catch (error) {
		<p class="caught">caught: {error.message} for {label}</p>
	}
}
