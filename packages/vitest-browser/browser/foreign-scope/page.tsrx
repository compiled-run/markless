import { box } from './family/box.tsrx';

// A page one directory above the family, reading factory computeds it did not
// define. Nothing here binds `shout` or `SUFFIX`; the modules the browser
// fetches to re-derive these cells have to carry both, with the family's
// relative specifier rebased onto this file.
export default function ForeignScopePage() @{
	const b = box();

	<section data-foreign-scope-page>
		<output data-loud>{b.loud}</output>
		<output data-framed>{b.framed}</output>
		<output data-raw>{b.label}</output>
		<button type="button" data-shout onClick={() => b.label = 'louder'}>shout</button>
	</section>
}
