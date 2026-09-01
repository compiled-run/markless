import { element, state } from '@markless/core';
import { tour } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths — which is the point of the shape. The tour is served showing
// so the current card is focusable: `tour.itemEls` is the plural handle a merge
// would pool, and ArrowRight from the shown card is what walks off the end of a
// pooled roster into the next embed.
export default function MultiEmbed() @{
	const saveEl = element<HTMLButtonElement>();
	const shareEl = element<HTMLButtonElement>();
	const page = state({ isOpen: true, step: 0 });

	<section data-testid="frame">
		<div data-testid="toolbar">
			<button type="button" data-testid="save" el={saveEl}>Save</button>
			<button type="button" data-testid="share" el={shareEl}>Share</button>
		</div>
		<output data-testid="step">{page.step}</output>

		<tour.root
			data-testid="root"
			open={page.isOpen}
			onChange={(step) => {
				page.step = step;
			}}
			onOpenChange={(open) => {
				page.isOpen = open;
			}}
		>
			<tour.backdrop data-testid="backdrop" />

			<tour.item data-testid="step-save" target={saveEl}>
				<tour.title data-testid="save-title">Save your work</tour.title>
				<tour.description data-testid="save-description">
					The Save button in the toolbar keeps a copy of the document.
				</tour.description>
				<tour.backtrigger data-testid="save-back">Back</tour.backtrigger>
				<tour.forwardtrigger data-testid="save-forward">Next</tour.forwardtrigger>
				<tour.close data-testid="save-close">Skip the tour</tour.close>
			</tour.item>

			<tour.item data-testid="step-share" target={shareEl}>
				<tour.title data-testid="share-title">Share it</tour.title>
				<tour.description data-testid="share-description">
					The Share button beside Save sends a read-only link.
				</tour.description>
				<tour.backtrigger data-testid="share-back">Back</tour.backtrigger>
				<tour.forwardtrigger data-testid="share-forward">Next</tour.forwardtrigger>
				<tour.close data-testid="share-close">Done</tour.close>
			</tour.item>
		</tour.root>
	</section>
}
