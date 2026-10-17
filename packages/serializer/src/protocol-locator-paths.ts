/**
 * The container attribute that lets resume find each located element by its
 * position under the nearest located ancestor, so a node a third-party script
 * adds or swaps elsewhere cannot shift it.
 *
 * Value: `<served element count>` then, per locator, `;<index>,<anchor index>,<child>,<child>...`.
 * `index` is the locator's DOM-order index (the container is 0), `anchor index` the DOM-order
 * index of its nearest located ancestor (or 0), and each `child` an element-child position.
 */
export const PROTOCOL_LOCATOR_PATHS_ATTRIBUTE = 'data-markless-paths';
