import { dial } from './family/dial.tsrx';

// The part that binds the family's plural handle. It lives in its own module so
// the family module keeps exactly one component.
export function Mark({ name }) @{
	const d = dial();

	<button type="button" data-mark data-name={name} el={d.markEls}>{name}</button>
}
