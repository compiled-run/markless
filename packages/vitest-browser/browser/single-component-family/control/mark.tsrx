import { controlDial } from './dial.tsrx';

export function ControlMark({ name }) @{
	const d = controlDial();

	<button type="button" data-mark data-name={name} el={d.markEls}>{name}</button>
}
