import { escapeAttribute } from '../../ast/tsrx.ts';

// The escaper's own table, read back off it, so the decode cannot drift from the
// escape it inverts. `escapeAttribute` is the wider of the two the renderer
// applies, so one map covers text-escaped and attribute-escaped bytes alike.
const DECODED_BY_ENTITY = new Map(
	Array.from({ length: 128 }, (_, code) => String.fromCharCode(code))
		.map((character) => [escapeAttribute(character), character] as const)
		.filter(([entity, character]) => entity !== character),
);

const ENTITY_PATTERN = new RegExp([...DECODED_BY_ENTITY.keys()].join('|'), 'g');

/**
 * The text a projection's compiled statics render as: tags dropped, entities
 * decoded. The statics are HTML, so the text the consumer wrote reaches them
 * escaped; a seed reading them hands its cell the authored characters, which is
 * what a reader hears when that cell lands in `aria-valuetext`.
 *
 * Decoding is one left-to-right pass, never chained replacements: authored
 * `&lt;` is `&amp;lt;` in the statics and must decode back to `&lt;`, not to `<`.
 *
 * Not an accessible-name computation: `aria-hidden`, `<img alt>` and
 * `<style>`/`<script>` content all make the stripped string differ from what a
 * reader computes over the rendered tree.
 */
export function projectionTextContent(statics: ReadonlyArray<string>): string {
	return statics
		.join('')
		.replaceAll(/<[^>]*>/g, '')
		.replaceAll(ENTITY_PATTERN, (entity) => DECODED_BY_ENTITY.get(entity) ?? entity);
}
