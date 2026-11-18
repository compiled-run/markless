import { state } from '@markless/core';
import ArmForm from './arm-form.tsrx';

export default function ArmPage() @{
	let sent = state(0);
	<main>
		<output data-sent>{sent}</output>
		<ArmForm
			name="kept"
			onSave={async (event) => {
				event.preventDefault();
				await Promise.resolve();
				sent += 1;
			}}
		/>
		<ArmForm name="native" onSave={() => { sent += 10; }} />
	</main>
}
