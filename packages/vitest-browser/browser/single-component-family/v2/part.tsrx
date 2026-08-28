import { v2Dial } from './dial.tsrx';

export function V2Part({ name }) @{
	const d = v2Dial();

	<button type="button" data-mark data-name={name} el={d.markEls}>{name}</button>
}
