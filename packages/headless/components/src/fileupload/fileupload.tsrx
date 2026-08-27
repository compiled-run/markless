// Every drag handler writes its disabled guard as a positive `if` around
// `preventDefault()`. Written as an early return the compiler extracts the bare
// call as unconditional, and a disabled upload would still cancel the default and
// accept drops.

import { element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	addFiles,
	openPicker,
	pointerOutside,
	removeFile,
	takePicked,
} from './fileupload-files.ts';
import type {
	FileRecord,
	FileUploadDropAreaProps,
	FileUploadFieldProps,
	FileUploadInstanceState,
	FileUploadItemCloseProps,
	FileUploadItemInstanceState,
	FileUploadItemLabelProps,
	FileUploadItemProps,
	FileUploadLabelProps,
	FileUploadRootProps,
	FileUploadTriggerProps,
} from './fileupload-types.ts';

export const fileuploadState = shared(
	() => {
		const upload: FileUploadInstanceState = state({
			files: [],
			accept: '',
			multiple: false,
			disabled: false,
			required: false,
			name: '',
			dragging: false,
		});
		const fieldEl = element<HTMLInputElement>();
		const labelEl = element<HTMLLabelElement>();
		const dropEl = element<HTMLDivElement>();

		return {
			...upload,
			fieldEl,
			labelEl,
			dropEl,
			onChange: undefined as ((files: readonly FileRecord[]) => void) | undefined,

			/** Opens the OS picker. The button is the keyboard and reader route in. */
			open() {
				if (upload.disabled || !fieldEl) return;
				openPicker(fieldEl);
			},

			/** Takes dropped files onto the upload, filtered against `accept`. */
			take(dropped: readonly File[]) {
				if (upload.disabled || !fieldEl || dropped.length === 0) return;
				upload.files = addFiles(fieldEl, dropped, upload.multiple, upload.accept);
				upload.onChange?.(upload.files);
			},

			/** Takes whatever the picker just chose. */
			picked() {
				if (upload.disabled || !fieldEl) return;
				upload.files = takePicked(fieldEl, upload.multiple, upload.accept);
				upload.onChange?.(upload.files);
			},

			/** Takes one file back off the upload, by the id its row carries. */
			remove(id: string) {
				if (!fieldEl) return;
				upload.files = removeFile(fieldEl, id);
				upload.onChange?.(upload.files);
			},
		};
	},
	{ scope: 'widget' },
);

export const fileuploadItemState = shared(
	() => {
		const item: FileUploadItemInstanceState = state({ id: '', name: '' });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function FileUploadRoot({
	accept = '',
	multiple = false,
	disabled = false,
	required = false,
	name = '',
	onChange,
	children,
	...rest
}: FileUploadRootProps) @{
	const upload = fileuploadState();
	upload.onChange = onChange;
	upload.accept = accept;
	upload.multiple = multiple;
	upload.disabled = disabled;
	upload.required = required;
	upload.name = name;

	<div {...rest} ui-disabled={upload.disabled}>{children}</div>
}

export function FileUploadLabel({ children, ...rest }: FileUploadLabelProps) @{
	const upload = fileuploadState();

	<label {...rest} el={upload.labelEl} for={upload.fieldEl}>{children}</label>
}

// No role and no tabindex: dropping is a pointer enhancement, and a second tab
// stop here would only repeat what the browse button already does.
export function FileUploadDropArea({
	children,
	onDragenter,
	onDragover,
	onDragleave,
	onDrop,
	...rest
}: FileUploadDropAreaProps) @{
	const upload = fileuploadState();

	<div
		{...rest}
		el={upload.dropEl}
		ui-dragging={upload.dragging}
		ui-disabled={upload.disabled}
		onDragenter={(event) => {
			if (!upload.disabled) {
				event.preventDefault();
				upload.dragging = true;
			}
			onDragenter?.(event);
		}}
		// Without this the drop event never fires at all.
		onDragover={(event) => {
			if (!upload.disabled) event.preventDefault();
			onDragover?.(event);
		}}
		onDragleave={(event) => {
			// A drag crossing onto a child fires dragleave on the area itself, so the
			// pointer has to be hit-tested rather than believed.
			if (pointerOutside(upload.dropEl, event.clientX, event.clientY)) {
				upload.dragging = false;
			}
			onDragleave?.(event);
		}}
		onDrop={(event) => {
			if (!upload.disabled) event.preventDefault();
			upload.dragging = false;
			upload.take(event.dataTransfer ? [...event.dataTransfer.files] : []);
			onDrop?.(event);
		}}
	>{children}</div>
}

export function FileUploadTrigger({ children, onClick, ...rest }: FileUploadTriggerProps) @{
	const upload = fileuploadState();

	<button
		{...rest}
		type="button"
		ui-disabled={upload.disabled}
		disabled={upload.disabled}
		onClick={(event) => {
			upload.open();
			onClick?.(event);
		}}
	>{children}</button>
}

// The real control, and the one that submits. It is clipped, aria-hidden and out
// of the tab order, so the browse button is the only way a person reaches it.
export function FileUploadField({ onChange, ...rest }: FileUploadFieldProps) @{
	const upload = fileuploadState();

	<VisuallyHidden>
		<input
			{...rest}
			el={upload.fieldEl}
			type="file"
			tabindex={-1}
			aria-hidden="true"
			name={upload.name}
			accept={upload.accept}
			multiple={upload.multiple}
			required={upload.required}
			disabled={upload.disabled}
			onChange={(event) => {
				upload.picked();
				onChange?.(event);
			}}
		/>
	</VisuallyHidden>
}

export function FileUploadItem({ file, children, ...rest }: FileUploadItemProps) @{
	const upload = fileuploadState();
	const item = fileuploadItemState();
	item.id = file.id;
	item.name = file.name;

	<div {...rest} ui-disabled={upload.disabled}>{children}</div>
}

export function FileUploadItemLabel({ children, ...rest }: FileUploadItemLabelProps) @{
	const item = fileuploadItemState();

	<span {...rest}>
		@if (children) {
			<>{children}</>
		} @else {
			<>{item.name}</>
		}
	</span>
}

export function FileUploadItemClose({ children, onClick, ...rest }: FileUploadItemCloseProps) @{
	const upload = fileuploadState();
	const item = fileuploadItemState();

	<button
		{...rest}
		type="button"
		onClick={(event) => {
			upload.remove(item.id);
			onClick?.(event);
		}}
	>{children}</button>
}
