import { shared, state, computed } from '@markless/core';

export const session = shared(() => {
	const data = state({ status: 'anonymous' });
	const signedIn = computed(() => data.status === 'ready');

	return {
		...data,
		signedIn,
		signIn() {
			data.status = 'ready';
		},
	};
});

export const theme = shared(() => {
	const data = state({ mode: 'light' });

	return {
		...data,
		toggle() {
			data.mode = 'dark';
		},
	};
}, { scope: 'page' });

export default function SharedTwoDefinitionsPage() @{
	const currentSession = session();
	const currentTheme = theme();

	<main data-two-definitions>
		<output data-status>{currentSession.status}</output>
		<output data-signed-in>{currentSession.signedIn}</output>
		<output data-mode>{currentTheme.mode}</output>
		<button type="button" data-sign-in onClick={() => currentSession.signIn()}>Sign in</button>
		<button type="button" data-toggle onClick={() => currentTheme.toggle()}>Toggle</button>
	</main>
}
