import { element, state } from '@markless/core';
import * as tour from '../index.ts';

// One step per placement. `side` is written onto the card as `ui-side` whether or
// not the step is the one showing, so a consumer's own rules keyed off it are
// there before the card is, and the family's `@layer markless` defaults turn each
// value into a `position-area` against the step's target.
//
// `start` and `end` are the writing direction's sides, so they swap in a
// right-to-left page; `top` and `bottom` are the same everywhere.
export default function Side() @{
	const topEl = element<HTMLButtonElement>();
	const bottomEl = element<HTMLButtonElement>();
	const startEl = element<HTMLButtonElement>();
	const endEl = element<HTMLButtonElement>();
	const page = state({ isOpen: false, step: 0 });

	<section>
		<style>
			[data-testid="toolbar"] { display: flex; gap: 8px; padding: 60px; }
			[data-testid="toolbar"] button { width: 90px; height: 30px; }
		</style>

		<div data-testid="toolbar">
			<button type="button" data-testid="above" el={topEl}>Above</button>
			<button type="button" data-testid="below" el={bottomEl}>Below</button>
			<button type="button" data-testid="before" el={startEl}>Before</button>
			<button type="button" data-testid="after" el={endEl}>After</button>
		</div>
		<button
			type="button"
			data-testid="start"
			onClick={() => {
				page.isOpen = true;
			}}
		>Take the tour</button>
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

			<tour.item index={0} data-testid="step-top" target={topEl} side="top">
				<tour.title data-testid="top-title">Above the target</tour.title>
				<tour.description data-testid="top-description">
					This card sits over the Above button in the toolbar.
				</tour.description>
				<tour.forwardtrigger data-testid="top-forward">Next</tour.forwardtrigger>
			</tour.item>

			<tour.item index={1} data-testid="step-bottom" target={bottomEl} side="bottom">
				<tour.title data-testid="bottom-title">Below the target</tour.title>
				<tour.description data-testid="bottom-description">
					This card sits under the Below button in the toolbar.
				</tour.description>
				<tour.forwardtrigger data-testid="bottom-forward">Next</tour.forwardtrigger>
			</tour.item>

			<tour.item index={2} data-testid="step-start" target={startEl} side="start">
				<tour.title data-testid="start-title">Before the target</tour.title>
				<tour.description data-testid="start-description">
					This card sits on the reading-order start side of the Before button.
				</tour.description>
				<tour.forwardtrigger data-testid="start-forward">Next</tour.forwardtrigger>
			</tour.item>

			<tour.item index={3} data-testid="step-end" target={endEl} side="end">
				<tour.title data-testid="end-title">After the target</tour.title>
				<tour.description data-testid="end-description">
					This card sits on the reading-order end side of the After button.
				</tour.description>
				<tour.close data-testid="end-close">Done</tour.close>
			</tour.item>

			{/* No `side`, so the card takes the family's `bottom` default rather than nothing. */}
			<tour.item index={4} data-testid="step-default" target={topEl}>
				<tour.title data-testid="default-title">The default placement</tour.title>
				<tour.description data-testid="default-description">
					A step that names no side is placed under the Above button.
				</tour.description>
				<tour.close data-testid="default-close">Done</tour.close>
			</tour.item>
		</tour.root>
	</section>
}
