// A plain .ts barrel: the parts get the lowercase member names authored tags
// use, and the family's shared definition is aliased to `state` — the name the
// ratified consumer surface calls (`family.state()`).
export { Root as root, Trigger as trigger, nscShared as state } from './namespace-state-call.tsrx';
