/**
 * A JavaScript engine as a host runs a payload's script: one persistent global scope; `evaluate` runs source as a script,
 * lets the Promise jobs it queued run, and returns `String()` of the completion value. A throw is thrown back.
 */
export type NativeScriptEngine = { readonly evaluate: (source: string) => string };
