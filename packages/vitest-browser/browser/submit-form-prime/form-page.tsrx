import { computed, state } from '@markless/core';

export default function FormPage() @{
	let sent = state('none');
	const customer = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { name: 'Ann' };
	});
	<main>
		<output data-sent>{sent}</output>
		@try {
			<form
				onSubmit={(event) => {
					event.preventDefault();
					sent = (event.target as HTMLFormElement).elements.namedItem('amount') ? 'sent' : 'none';
				}}
			>
				<p>{customer.name}</p>
				<input name="amount" data-amount />
				<button type="button" data-plain>Clear</button>
				<button type="submit" data-submit>Create</button>
			</form>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
