type LiveFeedPrerenderDocument = {
	querySelector(selector: string): unknown | null;
};

export function assertLiveFeedPrerenderedShell(document: LiveFeedPrerenderDocument): void {
	const placeholder = document.querySelector('#app');
	const marker = document.querySelector('[data-async-resumer][data-markless-resume-module]');
	if (!placeholder && marker) return;

	const error = Object.assign(
		new Error(
			'MARKLESS_PRERENDER_SHELL_MISSING: the prerender boot entry loaded without the prerendered #app shell. Ensure the Vite build enables Markless prerendering and serves the transformed index.html.',
		),
		{ code: 'MARKLESS_PRERENDER_SHELL_MISSING' },
	);
	console.error(error);
	throw error;
}
