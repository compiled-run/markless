export {
	InkArea as area,
	InkDescription as description,
	InkError as error,
	InkField as field,
	InkIndicator as indicator,
	InkLabel as label,
	InkRoot as root,
	inkState,
	inkState as state,
} from './ink.tsrx';
export { lastPath, withoutLast } from './ink-stroke.ts';
export type { InkPoint } from './ink-stroke.ts';
export type {
	InkAreaProps,
	InkDescriptionProps,
	InkErrorProps,
	InkFieldProps,
	InkIndicatorProps,
	InkLabelProps,
	InkRootProps,
} from './ink-types.ts';
