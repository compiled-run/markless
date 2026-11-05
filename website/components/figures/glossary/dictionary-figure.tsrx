// The glossary as a thumb-indexed dictionary with one numbered sense per word.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './dictionary.art.ts';

export default function DictionaryFigure() @{
	<DeskFigure
		art={art}
		label="Open the dictionary again"
		caption="A pen-and-ink drawing of a dictionary lying open on its cover, with four thumb tabs down its edge: Writing, Renders, How it works and Tooling, the page's four sections. It is open at How it works. The spread lists compiler, symbol and chunk on the left page and packing, payload and resume on the right, each with a single ringed sense numbered 1 and its meaning from the table. A note says one sense each."
		said="The dictionary is open at How it works. Every word on the spread has exactly one sense, numbered 1."
	/>
}
