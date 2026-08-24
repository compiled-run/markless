import { shared, state } from '@markless/core';

// A PAGE-scoped family and a WIDGET-scoped one, each with a part that carries an
// authored `attach=` behavior. The page-scoped row is the defect: its behavior
// symbol carries an instance path, and the CSR behavior pass activates behaviors
// before any runtime graph exists.
export const pageCounter = shared(() => {
	const data = state({ count: 0 });

	return {
		...data,
		bump() {
			data.count = data.count + 1;
		},
	};
});

export const widgetCounter = shared(
	() => {
		const data = state({ count: 0 });

		return {
			...data,
			bump() {
				data.count = data.count + 1;
			},
		};
	},
	{ scope: 'widget' },
);

function PagePart() @{
	const page = pageCounter();

	<button
		type="button"
		data-page-part
		attach={(element) => {
			element.setAttribute('data-attached', 'page');
		}}
		onClick={() => page.bump()}
	>{page.count}</button>
}

function WidgetPart() @{
	const widget = widgetCounter();

	<button
		type="button"
		data-widget-part
		attach={(element) => {
			element.setAttribute('data-attached', 'widget');
		}}
		onClick={() => widget.bump()}
	>{widget.count}</button>
}

function WidgetRoot({ children }) @{
	const widget = widgetCounter();

	<div data-widget-root data-widget-count={widget.count}>{children}</div>
}

export default function BehaviorPageScope() @{
	<main data-behavior-page-scope>
		<PagePart />
		<WidgetRoot>
			<WidgetPart />
		</WidgetRoot>
	</main>
}
