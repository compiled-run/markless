import { box } from './family/box.tsrx';

// A page one directory above the factory, so every cell it shows is re-derived
// from a copy of an expression written somewhere else. Nothing here binds
// `loud` or `banged`: those are cell reads the lowering rewrites, not free names
// the copy has to carry.
export default function SiblingComputedPage() @{
	const b = box();

	<section data-sibling-page>
		<output data-raw>{b.label}</output>
		<output data-loud>{b.loud}</output>
		<output data-banged>{b.banged}</output>
		<output data-asked>{b.asked}</output>
		<output data-shouted>{b.shouted}</output>
		<output data-seen>{b.seen}</output>
		<button type="button" data-shout onClick={() => (b.label = 'louder')}>shout</button>
		<button type="button" data-capture onClick={() => (b.seen = b.banged)}>capture</button>
	</section>
}
