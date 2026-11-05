import Gloss from './gloss.tsrx';

// The line under a title; a glossary word in it opens a note only when the caller names one.
export default function Caption({ text, word }: { readonly text?: string; readonly word?: string }) @{
	<>
	@if (word) {
		<div class="caption" role="paragraph">{text} <Gloss word={word} /></div>
	} @else {
		<p class="caption">{text}</p>
	}
	</>
}
