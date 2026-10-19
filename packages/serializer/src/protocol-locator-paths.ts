/**
 * The container attribute that lets resume find each located element by its
 * position under its parent, so a node a third-party script adds or swaps
 * elsewhere cannot shift it. Format: protocol-locator-paths-format.ts.
 */
export const PROTOCOL_LOCATOR_PATHS_ATTRIBUTE = 'data-markless-paths';

/**
 * The comment a host writes right after a container's served nodes when the
 * container is the author's own element (a document's `<body>`), which can also
 * hold nodes the page did not render: the document's content after the page, or
 * nodes a script appends later. A swap that replaces the page keeps what follows it.
 */
export const PROTOCOL_CONTAINER_END_COMMENT = 'markless:page-end';
