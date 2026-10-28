// Stands in for the package so the program pulls in no workspace sources.
declare module '@markless/core' {
	export function state<T>(initial: T): T;
}
