/**
 * The token a render writes where an expression SPENDS a roster count.
 *
 * A count is not knowable while the render is still emitting the members it
 * counts, so an expression standing on one cannot be evaluated in place: the
 * slot registers the expression as a thunk and prints this token instead. The
 * page's resolver calls the thunk once composition has made the counts facts,
 * and splices the answer back over the token.
 *
 * Private-use code points, for the same reason the count placeholder has its
 * own pair: no author writes one, so a token can never collide with rendered
 * text. A token never survives a render.
 *
 * Constants only. Everything that reads them is either one line at its call
 * site or lives in the resolver, which a page holding no count never loads.
 */
export const MARKLESS_DEFERRED_COUNT_OPEN = '\uE002';
export const MARKLESS_DEFERRED_COUNT_CLOSE = '\uE003';

/**
 * Separates the index from an attribute NAME. A whole attribute defers, not
 * just its value: for a boolean attribute presence is the value, so an
 * expression that answers false has to erase the name and the quotes too.
 */
export const MARKLESS_DEFERRED_COUNT_NAME = '\uE004';
