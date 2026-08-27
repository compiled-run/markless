import { element } from '@markless/core';

// A description and an error are separate elements, and the control names both:
// the author writes the two handles in the order a reader should hear them.
export default function IdrefListLocalPage() @{
	const errorEl = element<HTMLParagraphElement>();
	const descriptionEl = element<HTMLParagraphElement>();
	<div data-idref-list-local>
		<input data-list-control aria-describedby={[errorEl, descriptionEl]} />
		<p data-list-error el={errorEl}>Too short</p>
		<p data-list-description el={descriptionEl}>At least 8 characters</p>
	</div>
}
