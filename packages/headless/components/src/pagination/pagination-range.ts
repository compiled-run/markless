/**
 * One entry in a page range: a page a person can go to, or a gap between two
 * runs of pages. The gap carries no page number because there is nothing to
 * navigate to - the consumer renders it as an `aria-hidden` ellipsis.
 *
 * Every entry carries a `key` that identifies it across ranges, so a consumer
 * loops on `key entry.key` rather than on the index. An index key names a slot,
 * not an entry, so when the range slides the same index means a different page
 * and an interactive part inside the row has no row value to route a click to.
 * A page's key is its number; a gap's is the side it sits on, since a range
 * holds at most one gap on each side of the current page.
 */
export type PageEntry =
	| { readonly type: 'page'; readonly value: number; readonly key: string }
	| { readonly type: 'ellipsis'; readonly key: string };

/** Which side of the current page a gap sits on. */
type GapSide = 'leading' | 'trailing';

const pageEntry = (value: number): PageEntry => ({ type: 'page', value, key: `page:${value}` });
const ellipsis = (side: GapSide): PageEntry => ({ type: 'ellipsis', key: `ellipsis-${side}` });

/**
 * Which page numbers a pagination shows, and where the gaps fall.
 *
 * This is a plain function of three numbers: no state, no component, no
 * framework. A consumer holds it in a `computed()` and loops over the result.
 * That is deliberate - the family's parts render markup and carry ARIA, and the
 * arithmetic that decides which markup to render stays outside them, so a
 * consumer who wants a different range algorithm writes their own function and
 * the parts do not change.
 *
 * @param page which page is showing, counting from 1
 * @param count how many pages there are in total
 * @param siblingCount how many pages to show on each side of the current one
 */
export function pageRange(page: number, count: number, siblingCount = 1): PageEntry[] {
	if (count === 0) return [];

	// Below this many pages there is nothing to hide, so every page is shown and
	// no gap appears: the current page, its siblings on both sides, the first and
	// last page, and the two pages that would otherwise have become gaps.
	const maxShown = siblingCount * 2 + 5;
	if (count <= maxShown) {
		return Array.from({ length: count }, (_, index) => pageEntry(index + 1));
	}

	const leftSibling = Math.max(page - siblingCount, 1);
	const rightSibling = Math.min(page + siblingCount, count);

	// The thresholds are the ported ones, and they are the reason this comment
	// exists. A gap is only drawn when it would hide MORE than one page: at
	// `rightSibling === count - 1` the single page between the siblings and the
	// last page is rendered as itself, because a gap standing for one page is
	// worse than the page. QDS's own research document quotes two different
	// thresholds for this line; the shipped code uses these, the suite pins them,
	// and the exact flip pages are asserted there.
	const showLeft = leftSibling > 2;
	const showRight = rightSibling < count - 1;

	if (!showLeft && showRight) {
		const leftItems = Array.from({ length: 3 + 2 * siblingCount }, (_, index) =>
			pageEntry(index + 1),
		);
		return [...leftItems, ellipsis('trailing'), pageEntry(count)];
	}

	if (showLeft && !showRight) {
		const length = 3 + 2 * siblingCount;
		const rightItems = Array.from({ length }, (_, index) => pageEntry(count - length + index + 1));
		return [pageEntry(1), ellipsis('leading'), ...rightItems];
	}

	const middle = Array.from({ length: rightSibling - leftSibling + 1 }, (_, index) =>
		pageEntry(leftSibling + index),
	);
	return [pageEntry(1), ellipsis('leading'), ...middle, ellipsis('trailing'), pageEntry(count)];
}
