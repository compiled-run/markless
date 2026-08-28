import { element, state } from '@markless/core';
import { tour } from '../../index.ts';

// Five steps, each anchored to its own target. Placement is the consumer's CSS:
// every card takes the family's `block-end` default until a rule of the
// consumer's own, keyed off the step's `data-testid`, moves it.
export default function Placed() @{
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

			<tour.item data-testid="step-top" target={topEl}>
				<tour.title data-testid="top-title">Above the target</tour.title>
				<tour.description data-testid="top-description">
					This card sits over the Above button in the toolbar.
				</tour.description>
				<tour.forwardtrigger data-testid="top-forward">Next</tour.forwardtrigger>
			</tour.item>

			<tour.item data-testid="step-bottom" target={bottomEl}>
				<tour.title data-testid="bottom-title">Below the target</tour.title>
				<tour.description data-testid="bottom-description">
					This card sits under the Below button in the toolbar.
				</tour.description>
				<tour.forwardtrigger data-testid="bottom-forward">Next</tour.forwardtrigger>
			</tour.item>

			<tour.item data-testid="step-start" target={startEl}>
				<tour.title data-testid="start-title">Before the target</tour.title>
				<tour.description data-testid="start-description">
					This card sits on the reading-order start side of the Before button.
				</tour.description>
				<tour.forwardtrigger data-testid="start-forward">Next</tour.forwardtrigger>
			</tour.item>

			<tour.item data-testid="step-end" target={endEl}>
				<tour.title data-testid="end-title">After the target</tour.title>
				<tour.description data-testid="end-description">
					This card sits on the reading-order end side of the After button.
				</tour.description>
				<tour.close data-testid="end-close">Done</tour.close>
			</tour.item>

			<tour.item data-testid="step-default" target={topEl}>
				<tour.title data-testid="default-title">The default placement</tour.title>
				<tour.description data-testid="default-description">
					A step nobody wrote a rule for is placed under the Above button.
				</tour.description>
				<tour.close data-testid="default-close">Done</tour.close>
			</tour.item>
		</tour.root>
	</section>
}
