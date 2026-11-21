// What only native builds and the build plugin's device analysis use. Kept off the main entry, so the in-browser
// compiler (the docs' compile worker imports the main entry) never loads native code.
export { NATIVE_FACT_COLLECTORS } from './passes/semantic-graph/expression-tree.ts';
export { DEVICE_TARGET_FACTS } from './passes/semantic-graph/device-target.ts';
export { selectorAttributes } from './passes/native-selector-attributes.ts';
export {
	createNativeViewPayload,
	nativeRefusal,
	nativeUnsupported,
	NATIVE_KEYBOARD_ONLY_CODE,
	NATIVE_MOUSE_ONLY_CODE,
	NATIVE_DROP_ONLY_CODE,
	NATIVE_REFUSALS,
	NATIVE_UNSUPPORTED_CODE,
	type NativeRefusalKind,
	type NativeViewArtifact,
	type NativeViewOptions,
} from './passes/native-view.ts';
export { fontFaceSources } from './passes/native-font-faces.ts';
export { NATIVE_SCRIPT_ENGINE, type NativeScriptEngine } from './passes/native-script.ts';
