export {
	FileUploadDropArea as droparea,
	FileUploadField as field,
	FileUploadItem as item,
	FileUploadItemClose as itemclose,
	FileUploadItemLabel as itemlabel,
	FileUploadLabel as label,
	FileUploadRoot as root,
	FileUploadTrigger as trigger,
	fileuploadItemState,
	// One row's instance, for a consumer whose own part sits inside an item.
	fileuploadItemState as itemstate,
	fileuploadState,
	fileuploadState as state,
} from './fileupload.tsrx';
export type {
	FileRecord,
	FileUploadDropAreaProps,
	FileUploadFieldProps,
	FileUploadItemCloseProps,
	FileUploadItemLabelProps,
	FileUploadItemProps,
	FileUploadLabelProps,
	FileUploadRootProps,
	FileUploadTriggerProps,
} from './fileupload-types.ts';
