import { shared, state, computed } from '@markless/core';

export const session = shared(() => {
	const data = state({ user: 'none', status: 'anonymous' });
	const signedIn = computed(() => data.user !== 'none');

	return {
		...data,
		signedIn,
		login() {
			data.user = 'ada';
			data.status = 'ready';
		},
	};
});

function SessionHeader() @{
	const header = session();

	<header data-header>
		<output data-status>{header.status}</output>
		<output data-signed-in>{header.signedIn}</output>
	</header>
}

function SessionMenu() @{
	const menu = session();

	<nav data-menu>
		<output data-user>{menu.user}</output>
	</nav>
}

export default function SharedSessionPage() @{
	const page = session();

	<main data-shared-session>
		<SessionHeader />
		<SessionMenu />
		<button type="button" data-login onClick={() => page.login()}>Login</button>
	</main>
}
