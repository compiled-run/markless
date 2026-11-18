import { state } from '@markless/core';

function Editor({ label, onSubmit }: { readonly label: string; readonly onSubmit: (event: SubmitEvent) => void }) @{
	<form data-form={label} onSubmit={onSubmit}>
		<button type="submit">{label}</button>
	</form>
}

export default function SameFilePage() @{
	let sent = state(0);
	<section>
		<p data-sent>{sent}</p>
		<Editor
			label="kept"
			onSubmit={(event) => {
				event.preventDefault();
				sent += 1;
			}}
		/>
		<Editor
			label="native"
			onSubmit={() => {
				sent += 10;
			}}
		/>
	</section>
}
