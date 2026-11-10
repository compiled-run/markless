import { state } from '@markless/core';
import { pass } from './gates.ts';
import { typedText } from './typed-handler.ts';

export default function UnreadEditPage() @{
	let title = state('');
	<main>
		<button
			type="button"
			data-template
			onClick={async () => {
				await pass('template-write');
				title = 'template';
			}}
		>
			{'Use template'}
		</button>
		<input data-title value={title} onInput={(event) => (title = typedText(event))} />
		<p data-saved>{title}</p>
	</main>
}
