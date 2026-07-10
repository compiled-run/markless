export const MARKLESS_STATE_SCRIPT_TYPE = 'markless/state';
export const MARKLESS_VIEW_SCRIPT_TYPE = 'markless/view';
export const MARKLESS_ARM_SCRIPT_TYPE = 'markless/arm';

export const MARKLESS_ASYNC_CONTAINER_ATTRIBUTE = 'data-async-container';
export const MARKLESS_BOUNDARY_ATTRIBUTE = 'data-boundary';

export const MARKLESS_ASYNC_ANCHOR_PREFIX = 'markless:async:';
export const MARKLESS_ASYNC_END_ANCHOR_PREFIX = '/markless:async:';
export const MARKLESS_ARM_BRANCH_ANCHOR_PREFIX = 'markless:arm-branch:';
export const MARKLESS_ARM_BRANCH_END_ANCHOR_PREFIX = '/markless:arm-branch:';

export type MarklessPayloadScriptType =
	| typeof MARKLESS_STATE_SCRIPT_TYPE
	| typeof MARKLESS_VIEW_SCRIPT_TYPE;
