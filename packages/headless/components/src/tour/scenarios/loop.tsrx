import { element, state } from '@markless/core';
import * as tour from '../index.ts';

// `loop` turns the two ends into a ring: neither trigger is ever disabled, so a
// person can keep going round the same three steps.
export default function Loop() @{
	const saveEl = element<HTMLButtonElement>();
	const shareEl = element<HTMLButtonElement>();
	const trashEl = element<HTMLButtonElement>();
	const page = state({ isOpen: false, step: 0 });

	<section>
		<div data-testid="toolbar">
			<button type="button" data-testid="save" el={saveEl}>Save</button>
			<button type="button" data-testid="share" el={shareEl}>Share</button>
			<button type="button" data-testid="trash" el={trashEl}>Delete</button>
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
			loop
			open={page.isOpen}
			onChange={(step) => {
				page.step = step;
			}}
			onOpenChange={(open) => {
				page.isOpen = open;
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

			<tour.item index={1} data-testid="step-share" target={shareEl} side="top">
				<tour.title data-testid="share-title">Share it</tour.title>
				<tour.description data-testid="share-description">
					The Share button beside Save sends a read-only link.
				</tour.description>
				<tour.valuelabel data-testid="share-count" />
				<tour.backtrigger data-testid="share-back">Back</tour.backtrigger>
				<tour.forwardtrigger data-testid="share-forward">Next</tour.forwardtrigger>
				<tour.close data-testid="share-close">Skip the tour</tour.close>
			</tour.item>

			<tour.item index={2} data-testid="step-trash" target={trashEl}>
				<tour.title data-testid="trash-title">Delete it</tour.title>
				<tour.description data-testid="trash-description">
					The Delete button at the end of the toolbar throws the document away.
				</tour.description>
				<tour.valuelabel data-testid="trash-count" />
				<tour.backtrigger data-testid="trash-back">Back</tour.backtrigger>
				<tour.forwardtrigger data-testid="trash-forward">Next</tour.forwardtrigger>
				<tour.close data-testid="trash-close">Done</tour.close>
			</tour.item>
		</tour.root>
	</section>
}
