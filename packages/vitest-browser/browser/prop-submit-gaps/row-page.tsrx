import { state } from '@markless/core';
import RowForms from './row-forms.tsrx';

export default function RowPage() @{
	let sent = state(0);
	<main>
		<output data-sent>{sent}</output>
		<RowForms
			name="kept"
			onSave={async (event) => {
				event.preventDefault();
				await Promise.resolve();
				sent += 1;
			}}
		/>
		<RowForms name="native" onSave={() => { sent += 10; }} />
	</main>
}
