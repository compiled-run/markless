export {
	ToggleGroupItem as item,
	ToggleGroupItemField as itemfield,
	ToggleGroupLabel as label,
	ToggleGroupRoot as root,
	togglegroupItemState,
	// One item's instance, for a consumer whose own part sits inside an item.
	togglegroupItemState as itemstate,
	togglegroupState,
	togglegroupState as state,
} from './togglegroup.tsrx';
export type {
	ToggleGroupItemFieldProps,
	ToggleGroupItemProps,
	ToggleGroupLabelProps,
	ToggleGroupOrientation,
	ToggleGroupRootProps,
	ToggleGroupValue,
} from './togglegroup-types.ts';
export { heldValues } from './togglegroup-values.ts';
