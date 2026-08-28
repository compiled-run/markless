export {
	TagListDescription as description,
	TagListError as error,
	TagListField as field,
	TagListInput as input,
	TagListItem as item,
	TagListItemClose as itemclose,
	TagListItemInput as iteminput,
	TagListItemLabel as itemlabel,
	TagListLabel as label,
	TagListRoot as root,
	taglistItemState,
	// One tag's instance, for a consumer whose own part sits inside an item.
	taglistItemState as itemstate,
	taglistState,
	taglistState as state,
} from './taglist.tsrx';
export type {
	TagListDescriptionProps,
	TagListErrorProps,
	TagListFieldProps,
	TagListInputProps,
	TagListItemCloseProps,
	TagListItemInputProps,
	TagListItemLabelProps,
	TagListItemProps,
	TagListLabelProps,
	TagListRootProps,
} from './taglist-types.ts';
