/** Any `<svg>` attribute, plus the labels that become the icon's `<title>` and `<desc>`. */
export type IconProps = {
	readonly title?: string;
	readonly description?: string;
	readonly [attribute: string]: unknown;
};

export type Icon = (props: IconProps) => unknown;

export { packs } from './generated-runtime.ts';
export * from './generated-runtime.ts';
