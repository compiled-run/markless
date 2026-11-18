import { state } from '@markless/core';
import Toolbar from './toolbar.tsrx';

export default function MiddlePage() @{
	let sent = state(0);
	<main>
		<output data-sent>{sent}</output>
		<Toolbar
			name="kept"
			onSave={async (event) => {
				event.preventDefault();
				await Promise.resolve();
				sent += 1;
			}}
		/>
		<Toolbar name="native" onSave={() => { sent += 10; }} />
	</main>
}
