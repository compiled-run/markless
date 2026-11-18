import { shared, state } from '@markless/core';

function shout(from: EventTarget | null): string {
	const control = from as HTMLInputElement | null;
	if (!control) return '';
	return control.value.toUpperCase();
}

const fieldState = shared(
	() => {
		const field = state({ value: '', changes: 0 });
		return {
			...field,
			type(from: EventTarget | null) {
				const control = from as HTMLInputElement | null;
				if (!control) return;
				if (control.value === field.value) return;
				field.value = control.value;
				field.changes = field.changes + 1;
			},
		};
	},
	{ scope: 'subtree' },
);

function Field() @{
	const field = fieldState();
	let loud = state('');
	<div>
		<input
			aria-label="Name"
			value={field.value}
			onInput={(event) => {
				field.type(event.target);
				loud = shout(event.currentTarget);
			}}
		/>
		<p>{`Kept ${field.value} after ${field.changes}`}</p>
		<p>{loud}</p>
	</div>
}

export default function TypedTarget() @{
	<main>
		<Field />
	</main>
}
