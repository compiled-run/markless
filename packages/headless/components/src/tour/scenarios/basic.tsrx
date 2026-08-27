import { element, state } from '@markless/core';
import * as tour from '../index.ts';

// The starter a consumer copies: three steps, each about a button the page owns.
// The consumer mints the handle and hands it to the step as a bare prop, because
// a tour may not look its target up and a handle does not survive an array.
export default function Basic() @{
	const saveEl = element<HTMLButtonElement>();
	const shareEl = element<HTMLButtonElement>();
	const trashEl = element<HTMLButtonElement>();
	const page = state({ isOpen: false, step: 0, closes: 0 });

	<section>
		<style>
			[data-testid="toolbar"] { display: flex; gap: 8px; padding: 40px; }
			[data-testid="toolbar"] button { width: 90px; height: 30px; }
		</style>

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
		<output data-testid="closes">{page.closes}</output>

		<tour.root
			data-testid="root"
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
