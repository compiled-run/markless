// The compiler cannot turn this into TypeScript: the tag is never closed. An editor
// recovers a file like this so a half-typed keystroke still gets completions; a checker
// must not, or an unparsable file would pass the gate with nothing to check.
export function Broken() @{
	<button type="button">
}
