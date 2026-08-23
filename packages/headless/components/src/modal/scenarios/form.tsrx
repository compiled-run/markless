import { state } from '@markless/core';
import * as modal from '../index.ts';

// Two shapes Base UI's own suite reaches for. The first is the commonest real
// dialog: a form inside the surface whose save control closes it. The second
// wraps the surface in a `display: contents` ancestor, which is what a consumer
// gets the moment they put the form outside `modal.content` instead of inside -
// it must break neither the opening focus nor the tab cycle.
//
// The save control is type="button" rather than type="submit" because a native
// submit navigates the page here; note.md records the measurement.
export default function Form() @{
	const page = state({ saved: '' });

	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="form-root">
			<modal.trigger data-testid="form-trigger">Rename</modal.trigger>
			<modal.backdrop data-testid="form-backdrop">
				<modal.content data-testid="form-content">
					<modal.title data-testid="form-title">Rename the project</modal.title>
					<form data-testid="form">
						<input data-testid="form-input" name="title" />
						<button
							type="button"
							data-testid="form-submit"
							onClick={() => {
								page.saved = 'submitted';
							}}
						>Save</button>
					</form>
					<modal.close data-testid="form-close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		<p data-testid="saved">{page.saved}</p>

		<modal.root data-testid="wrap-root">
			<modal.trigger data-testid="wrap-trigger">Filters</modal.trigger>
			<modal.backdrop data-testid="wrap-backdrop">
				<div data-testid="wrap-shell" style="display: contents">
					<modal.content data-testid="wrap-content">
						<modal.title data-testid="wrap-title">Filters</modal.title>
						<input data-testid="wrap-input" name="q" />
						<modal.close data-testid="wrap-close">Done</modal.close>
					</modal.content>
				</div>
			</modal.backdrop>
		</modal.root>
	</section>
}
