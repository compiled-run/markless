import { element, state } from '@markless/core';
import { tour } from '../../index.ts';

// The tour one component down from the page: the page's own state opens it from inside a child component.
export default function Nested() @{
	<main>
		<section>
			<NestedTour />
		</section>
	</main>
}

function NestedTour() @{
	const saveEl = element<HTMLButtonElement>();
	const shareEl = element<HTMLButtonElement>();
	const page = state({ isOpen: false });

	<div>
		<div>
			<button type="button" el={saveEl}>Save</button>
			<button type="button" el={shareEl}>Share</button>
		</div>
		<button
			type="button"
			data-testid="nested-start"
			onClick={() => {
				page.isOpen = true;
			}}
		>Take the tour</button>

		<tour.root
			open={page.isOpen}
			onOpenChange={(open) => {
				page.isOpen = open;
			}}
		>
			<tour.item data-testid="nested-first" target={saveEl}>
				<tour.title>Save your work</tour.title>
				<tour.forwardtrigger data-testid="nested-forward">Next</tour.forwardtrigger>
				<tour.close>Skip the tour</tour.close>
			</tour.item>

			<tour.item data-testid="nested-second" target={shareEl}>
				<tour.title>Share it</tour.title>
				<tour.close>Done</tour.close>
			</tour.item>
		</tour.root>
	</div>
}
