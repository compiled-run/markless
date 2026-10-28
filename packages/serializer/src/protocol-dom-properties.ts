// Own module so the row mint reads which DOM members are properties without the rest of the protocol.

/** Members whose attribute only sets the first value: the page renders the attribute, and every later write sets the property. */
export const PROTOCOL_LIVE_PROPERTY_MEMBERS: ReadonlyArray<string> = [
	'value',
	'checked',
	'selected',
	'muted',
];

/** Members with no attribute at all: every write sets the property, and the attribute is never written. */
export const PROTOCOL_PROPERTY_ONLY_MEMBERS: ReadonlyArray<string> = [
	'indeterminate',
	'volume',
	'currentTime',
	'playbackRate',
	'defaultPlaybackRate',
	'scrollTop',
	'scrollLeft',
	'srcObject',
];

/** Properties that read and write an attribute of another name; a binding to one writes that attribute. */
export const PROTOCOL_REFLECTED_PROPERTY_ATTRIBUTES: Readonly<Record<string, string>> = {
	defaultValue: 'value',
	defaultChecked: 'checked',
	defaultSelected: 'selected',
	defaultMuted: 'muted',
};
