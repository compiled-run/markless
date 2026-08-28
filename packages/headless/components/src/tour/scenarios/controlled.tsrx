import { element, state } from '@markless/core';
import { tour } from '../../index.ts';

// The family ships no trigger part, so every opener is the page flipping `open`,
// and the page hears each move back through `onChange`.
//
// The step controls are the family's own parts mounted as page chrome, outside
// every card and directly under the root, rather than repeated inside each step.
// They have to be: `tour.state()`'s `next`/`prev`/`skip` cannot be called from a
// consumer module at all - a `shared()` method compiles by copying its body into
// the calling handler, and the copy loses this family's module scope, so the
// build refuses it with MARKLESS_SHARED_METHOD_CROSS_MODULE. Composing the
// published part is the route the diagnostic names.
export default function Controlled() @{
	const saveEl = element<HTMLButtonElement>();
	const shareEl = element<HTMLButtonElement>();
	const trashEl = element<HTMLButtonElement>();
	const page = state({ isOpen: false, step: 0, opens: 0, closes: 0 });

	<section>
		<div data-testid="toolbar">
			<button type="button" data-testid="save" el={saveEl}>Save</button>
			<button type="button" data-testid="share" el={shareEl}>Share</button>
			<button type="button" data-testid="trash" el={trashEl}>Delete</button>
		</div>
		<button
			type="button"
			data-testid="opener"
			onClick={() => {
				page.isOpen = true;
			}}
		>Open from the page</button>
		<button
			type="button"
			data-testid="closer"
			onClick={() => {
				page.isOpen = false;
			}}
		>Close from the page</button>
		<output data-testid="step">{page.step}</output>
		<output data-testid="opens">{page.opens}</output>
		<output data-testid="closes">{page.closes}</output>

		<tour.root
			data-testid="root"
			open={page.isOpen}
			onChange={(step) => {
				page.step = step;
			}}
			onOpenChange={(open) => {
				page.isOpen = open;
				if (open === true) page.opens = page.opens + 1;
				if (open !== true) page.closes = page.closes + 1;
			}}
		>
			<tour.backdrop data-testid="backdrop" />

			<div data-testid="chrome">
				<tour.backtrigger data-testid="chrome-back">Back</tour.backtrigger>
				<tour.forwardtrigger data-testid="chrome-forward">Next</tour.forwardtrigger>
				<tour.close data-testid="chrome-close">End the tour</tour.close>
				<tour.valuelabel data-testid="chrome-count" />
			</div>

			<tour.item index={0} data-testid="step-save" target={saveEl}>
				<tour.title data-testid="save-title">Save your work</tour.title>
				<tour.description data-testid="save-description">
					The Save button in the toolbar keeps a copy of the document.
				</tour.description>
			</tour.item>

			<tour.item index={1} data-testid="step-share" target={shareEl}>
				<tour.title data-testid="share-title">Share it</tour.title>
				<tour.description data-testid="share-description">
					The Share button beside Save sends a read-only link.
				</tour.description>
			</tour.item>

			<tour.item index={2} data-testid="step-trash" target={trashEl}>
				<tour.title data-testid="trash-title">Delete it</tour.title>
				<tour.description data-testid="trash-description">
					The Delete button at the end of the toolbar throws the document away.
				</tour.description>
			</tour.item>
		</tour.root>
	</section>
}
