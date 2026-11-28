import { state } from '@markless/core';

export function App() @{
	let log = state('');
	let open = state(true);

	<main>
		<input
			data-field
			onKeyDown={(event) => {
				log = log + 'element;';
				if (event.key === 's') event.stopPropagation();
			}}
		/>
		<p
			data-log
			onDocumentKeyDown={() => (log = log + 'document;')}
			onWindowKeyDown={() => (log = log + 'window;')}
		>
			{log}
		</p>
		<section
			data-guard
			onDocumentKeyDown={(event) => {
				if (open && event.key === 'Escape') {
					event.preventDefault();
					open = false;
				}
			}}
		>
			{open ? 'open' : 'closed'}
		</section>
	</main>
}
