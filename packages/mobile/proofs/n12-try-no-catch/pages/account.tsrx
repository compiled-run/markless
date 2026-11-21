import { computed } from '@markless/core';

async function loadAccount(): Promise<string> {
	throw new Error('The account service is down');
}

export default function Account() @{
	const account = computed(async () => loadAccount());
	<main>
		<h1>Account</h1>
		@try {
			<p>{`Signed in as ${account}`}</p>
		} @pending {
			<p>Loading account</p>
		}
	</main>
}
