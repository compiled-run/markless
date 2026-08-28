/**
 * How many reading steps a real-reader transcript gives itself to reach its
 * family on the gallery page, which is one document holding every family.
 *
 * Measured, not guessed: `node apps/sr-gallery/scripts/measure-walk.ts` walks the
 * served page with @guidepup/virtual-screen-reader and prints the step each
 * section is reached at. One full pass over the 33 sections is 435
 * announcements. This is twice that, so a walk finds its target from wherever
 * the cursor starts - the reader wraps at the end of the document - and the
 * number stops depending on where a section sits. Per-file guesses drifted:
 * seven were below the distance they had to cover.
 */
export const GALLERY_WALK_LIMIT = 900;
