import { state } from '@markless/core';
import SaveForm from './save-form.tsrx';

export default function ImportedPage() @{
	let sent = state(0);
	<main>
		<output data-sent>{sent}</output>
		<SaveForm
			name="kept"
			onSave={async (event) => {
				event.preventDefault();
				await Promise.resolve();
				sent += 1;
			}}
		/>
		<SaveForm
			name="native"
			onSave={() => {
				sent += 10;
			}}
		/>
	</main>
}
