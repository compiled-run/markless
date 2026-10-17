/**
 * The attribute the server writes on each element whose event record carries a
 * sync policy (preventDefault, stopPropagation), valued with that record's
 * hostNodeId. The inline boot finds the policy from the event's own target up
 * to the nearest marked element, so it never needs the element's position.
 */
export const PROTOCOL_SYNC_POLICY_HOST_ATTRIBUTE = 'data-markless-sync';
