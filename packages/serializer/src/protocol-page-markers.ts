// Comments around the page's nodes when an author's element (a document's <body>) is the container.
export const PROTOCOL_CONTAINER_START_COMMENT = 'markless:page-start';
export const PROTOCOL_CONTAINER_END_COMMENT = 'markless:page-end';
export const PROTOCOL_CONTAINER_HOST_NODE_ID = 'container';
// An @if, @switch or @try start comment: it, its content and the comment `/` + its text are one step of an element address.
export const PROTOCOL_BLOCK_START_COMMENT = /^markless:(?:branch|arm-branch|async):/;
