import { shared, state } from '@markless/core';
import { PanelRoot, panelState } from './panel.tsrx';

// The PAGE family. `BarItem` seeds it and composes another family's widget root
// around its control, so the control's handler writes the panel instance its own
// item composed. `BarControl` is declared first: a component composing one
// declared later in the same module is a use-before-initialization at import.
export const itemState = shared(
	() => {
		const item = state({ name: '', presses: 0 });

		return { ...item };
	},
	{ scope: 'widget' },
);

function BarControl() @{
	const item = itemState();
	const panel = panelState();

	<button
		type="button"
		data-bar-control
		data-name={item.name}
		data-presses={item.presses}
		onKeydown={(event) => {
			if (event.key !== 'ArrowDown') return;
			item.presses = item.presses + 1;
			panel.opens = panel.opens + 1;
			panel.openedBy = item.name;
		}}
	>{item.name}</button>
}

export function BarItem({ name = '', children }) @{
	const item = itemState();
	item.name = name;

	<div data-bar-item data-name={item.name} data-presses={item.presses}>
		<PanelRoot>
			<BarControl />
			{children}
		</PanelRoot>
	</div>
}
