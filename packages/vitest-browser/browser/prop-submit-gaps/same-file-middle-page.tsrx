import { state } from '@markless/core';

function Editor({ label, onSubmit }: { readonly label: string; readonly onSubmit: (event: SubmitEvent) => void }) @{
	<form data-form={label} onSubmit={onSubmit}>
		<button type="submit">{label}</button>
	</form>
}

function Panel({ label, onSubmit: submit }: { readonly label: string; readonly onSubmit: (event: SubmitEvent) => void }) @{
	<aside>
		<Editor label={label} onSubmit={submit} />
	</aside>
}

export default function SameFileMiddlePage() @{
	let sent = state(0);
	<section>
		<p data-sent>{sent}</p>
		<Panel
			label="kept"
			onSubmit={(event) => {
				event.preventDefault();
				sent += 1;
			}}
		/>
		<Panel label="native" onSubmit={() => { sent += 10; }} />
	</section>
}
