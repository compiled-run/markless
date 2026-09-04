export type IconProps = __MarklessTypeService.IntrinsicElementFor<'svg'> & {
	readonly title?: string;
	readonly description?: string;
};

export type Icon = (props: IconProps) => __MarklessTypeService.Child;

export { packs } from './generated-runtime.ts';
export * from './generated-runtime.ts';
