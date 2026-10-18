import { state } from '@markless/core';

export default function FoldedPreventDefaultPage() @{
	let active = state(0);
	let escapes = state(0);
	<section>
		<ul
			data-list
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === 'ArrowDown') {
					event.preventDefault();
					active = active + 1;
				}
				if (event.key === 'ArrowUp') {
					event.preventDefault();
					active = active - 1;
				}
			}}
		>
			<li>one</li>
			<li>two</li>
		</ul>
		<input
			data-dialog-field
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					escapes = escapes + 1;
				} else {
					event.stopPropagation();
				}
			}}
		/>
		<output data-active>{active}</output>
		<output data-escapes>{escapes}</output>
	</section>
}
