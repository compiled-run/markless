import { element } from '@markless/core';

// Shape 1: a handle declared in the component body, bound with `el=` on an
// element, and read inside a handler. Both directions are here: the element's
// OWN handler, and the spec's SearchBox shape where a second element's handler
// reaches the first one through an optional call.
export default function EhvSelfPage() @{
	const box = element<HTMLButtonElement>();
	const field = element<HTMLInputElement>();

	<div data-ehv-self-root>
		<button type="button" data-ehv-self el={box} onClick={() => {
			box.setAttribute('data-self-hit', 'yes');
		}}>self</button>
		<input data-ehv-self-field el={field} />
		<button type="button" data-ehv-self-focus onClick={() => {
			field?.focus();
		}}>focus the field</button>
	</div>
}
