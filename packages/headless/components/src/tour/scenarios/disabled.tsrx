import { element, state } from '@markless/core';
import { tour } from '../../index.ts';

// `disabled` freezes the walk, not the tour: the card still shows the step it is
// on, both triggers report themselves off, the arrow keys move nothing, and the
// person can still leave - `close()` is not gated by it, because a tour nobody
// can dismiss is a trap.
export default function Disabled() @{
	const saveEl = element<HTMLButtonElement>();
	const shareEl = element<HTMLButtonElement>();
	const page = state({ isOpen: true, step: 0, closes: 0 });

	<section>
		<div data-testid="toolbar">
			<button type="button" data-testid="save" el={saveEl}>Save</button>
			<button type="button" data-testid="share" el={shareEl}>Share</button>
		</div>
		<output data-testid="step">{page.step}</output>
		<output data-testid="closes">{page.closes}</output>

		<tour.root
			data-testid="root"
			disabled
			open={page.isOpen}
			onChange={(step) => {
				page.step = step;
			}}
			onOpenChange={(open) => {
				page.isOpen = open;
				if (open !== true) page.closes = page.closes + 1;
			}}
		>
			<tour.backdrop data-testid="backdrop" />

			<tour.item index={0} data-testid="step-save" target={saveEl}>
				<tour.title data-testid="save-title">Save your work</tour.title>
				<tour.description data-testid="save-description">
					The Save button in the toolbar keeps a copy of the document.
				</tour.description>
				<tour.valuelabel data-testid="save-count" />
				<tour.backtrigger data-testid="save-back">Back</tour.backtrigger>
				<tour.forwardtrigger data-testid="save-forward">Next</tour.forwardtrigger>
				<tour.close data-testid="save-close">Skip the tour</tour.close>
			</tour.item>

			<tour.item index={1} data-testid="step-share" target={shareEl}>
				<tour.title data-testid="share-title">Share it</tour.title>
				<tour.description data-testid="share-description">
					The Share button beside Save sends a read-only link.
				</tour.description>
				<tour.valuelabel data-testid="share-count" />
				<tour.backtrigger data-testid="share-back">Back</tour.backtrigger>
				<tour.forwardtrigger data-testid="share-forward">Next</tour.forwardtrigger>
				<tour.close data-testid="share-close">Done</tour.close>
			</tour.item>
		</tour.root>
	</section>
}
