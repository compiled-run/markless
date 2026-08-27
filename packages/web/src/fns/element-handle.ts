/**
 * The refused-focus replay these three names spell now lives in
 * `resume-events.ts`: a module of its own executed on every dispatch, including
 * the plain clicks that read no handle, which progressive execution forbids.
 * This file stays as the name the shim is imported under.
 */
export {
	marklessBeginFocusCommit,
	marklessEndFocusCommit,
	marklessHandleFocusReader,
} from '../resume-events.ts';
