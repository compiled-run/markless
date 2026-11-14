// Script types of a streamed arm's records and of the state delta that rides with it.
export const PROTOCOL_STREAMED_ARM_SCRIPT_TYPE = 'markless/arm';
export const PROTOCOL_STATE_PATCH_SCRIPT_TYPE = 'markless/state-patch';
// On a streamed arm's records: the page starts its runtime after load. Server-side only, so not re-exported from the protocol module browsers load.
export const PROTOCOL_STREAMED_ARM_START_ATTRIBUTE = 'data-start';
