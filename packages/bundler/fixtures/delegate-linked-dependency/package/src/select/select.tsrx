import { toolbarState } from '../toolbar/toolbar.tsrx';

export function SelectRoot() @{
	const toolbar = toolbarState();

	<section data-linked-select>
		<button el={toolbar.itemEls} data-linked-option>Linked option</button>
	</section>
}
