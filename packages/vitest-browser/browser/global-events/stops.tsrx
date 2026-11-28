import { state } from '@markless/core';

export function App() @{
	let log = state('');

	<main>
		<output data-log>{log}</output>
		<p
			data-first
			onDocumentKeyDown={(event) => {
				log = log + (event.currentTarget === document ? 'first@document;' : 'first@other;');
				if (event.key === 'p') event.stopPropagation();
				if (event.key === 'i') event.stopImmediatePropagation();
			}}
		>
			first
		</p>
		<p
			data-second
			onDocumentKeyDown={() => (log = log + 'second;')}
			onWindowKeyDown={(event) => (log = log + (event.currentTarget === window ? 'window@window;' : 'window@other;'))}
		>
			second
		</p>
	</main>
}
