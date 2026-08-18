import { state } from '@markless/core';

export function App() @{
	let picked = state('body');

	<section data-expression-class>
		<button type="button" data-pick-markup onClick={() => picked = 'markup'}>
			Markup
		</button>
		<button type="button" data-pick-body onClick={() => picked = 'body'}>
			Body
		</button>
		<span data-line-body class={picked === 'body' ? 'file-line is-lit' : 'file-line'}>
			{'body line'}
		</span>
		<span data-line-markup class={picked === 'markup' ? 'file-line is-lit' : 'file-line'}>
			{'markup line'}
		</span>
		<p data-note>{picked === 'body' ? 'The body is lit.' : 'The markup is lit.'}</p>
	</section>
}
