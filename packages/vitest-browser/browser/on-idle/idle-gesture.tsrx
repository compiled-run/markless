const log = (entry: string) => {
	const host = globalThis as { __deferLog?: string[] };
	(host.__deferLog ??= []).push(entry);
};

export function App() @{
	<main>
		<button type="button" data-press onClick={() => log('click')}>press</button>
		<section data-idle onIdle={() => log('idle')}>idle</section>
		<p>one</p>
		<p>two</p>
	</main>
}
