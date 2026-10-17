const log = (entry: string) => {
	const host = globalThis as { __foreignDeferLog?: string[] };
	(host.__foreignDeferLog ??= []).push(entry);
};

export function App() @{
	<main>
		<header>
			<div data-search-slot><button type="button">Search</button></div>
		</header>
		<section data-visible onVisible={() => log('visible')}>seen</section>
		<p data-idle onIdle={() => log('idle')}>idle</p>
	</main>
}
