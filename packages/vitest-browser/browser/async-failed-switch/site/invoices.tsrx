import { computed, state } from '@markless/core';
import Button from './ui/Button.tsrx';
import Skeleton from './ui/Skeleton.tsrx';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.tsrx';
import { switchClasses } from './ui/switch.ts';
import { Table, TableHead, TableHeader, TableRow } from './ui/table.tsrx';
import { CheckIcon } from './ui/icons.tsrx';
import { checkboxClass } from './ui/checkbox.ts';
import { badgeVariants, classes } from './ui/variants.ts';

const statusBadge = {
	paid: badgeVariants({ variant: 'secondary' }),
	pending: badgeVariants({ variant: 'outline' }),
	overdue: badgeVariants({ variant: 'destructive' }),
};
import { getSiteInvoices as getInvoices } from '../gate.ts';

export default function Invoices({ reload }: { reload: number }) @{
	const view = state({ page: 1, usd: false, selected: [] as string[] });
	const invoices = computed(async () => await getInvoices(view.page, reload));
	const pageLabel = computed(() => `Page ${invoices.page} of ${invoices.pages}`);
	const nav = computed(() => ({ hasPrev: invoices.page > 1, hasNext: invoices.page < invoices.pages }));
	const switchState = computed(() => (view.usd ? 'checked' : 'unchecked'));

	<div class="w-full" data-slot="data-table">
		<div class="flex items-center justify-end py-4">
			<label class={switchClasses.label}>
				<button
					type="button"
					role="switch"
					aria-checked={view.usd ? 'true' : 'false'}
					data-state={switchState}
					data-size="default"
					data-slot="switch"
					class={switchClasses.root}
					onClick={() => (view.usd = !view.usd)}
				>
					<span data-slot="switch-thumb" data-state={switchState} class={switchClasses.thumb}></span>
				</button>
				Show amounts in USD
			</label>
		</div>
		<div class="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead><span class="sr-only">Select</span></TableHead>
						<TableHead>Invoice</TableHead>
						<TableHead>Customer</TableHead>
						<TableHead>Status</TableHead>
						<TableHead class="text-right">Amount</TableHead>
					</TableRow>
				</TableHeader>
				<tbody data-slot="table-body" class={classes.tableBody}>
					@try {
						@for (const invoice of invoices.rows; key invoice.id) {
							<tr data-slot="table-row" class={classes.tableRow} data-state={view.selected.includes(invoice.id) ? 'selected' : 'idle'}>
								<td data-slot="table-cell" class={classes.tableCell}>
									<button
										type="button"
										role="checkbox"
										aria-checked={view.selected.includes(invoice.id) ? 'true' : 'false'}
										aria-label={`Select ${invoice.id}`}
										class={checkboxClass}
										onClick={() =>
											(view.selected = view.selected.includes(invoice.id)
												? view.selected.filter((other) => other !== invoice.id)
												: [...view.selected, invoice.id])}
									>
										<span class="grid place-content-center"><CheckIcon class="size-3.5" /></span>
									</button>
								</td>
								<td data-slot="table-cell" class={`${classes.tableCell} font-medium`}>{invoice.id}</td>
								<td data-slot="table-cell" class={classes.tableCell}>{invoice.customer}</td>
								<td data-slot="table-cell" class={classes.tableCell}>
									<span data-slot="badge" class={`${statusBadge[invoice.status]} capitalize`}>{invoice.status}</span>
								</td>
								<td data-slot="table-cell" class={`${classes.tableCell} text-right font-medium`} data-amount="">{view.usd ? invoice.usd : invoice.eur}</td>
							</tr>
						}
					} @pending {
						<tr><td colspan="5" class="p-2"><Skeleton class="h-8 w-full" /></td></tr>
					} @catch {
						<tr>
							<td colspan="5" class="p-2">
								<Alert variant="destructive">
									<AlertTitle>Couldn't load the next page.</AlertTitle>
									<AlertDescription>The table still shows the last page that loaded.</AlertDescription>
								</Alert>
							</td>
						</tr>
					}
				</tbody>
			</Table>
		</div>
		<div class="flex items-center justify-end space-x-2 py-4">
			<div class="flex-1 text-sm text-muted-foreground">
				@try {
					<span data-page-label="">{pageLabel}</span>
				} @pending {
					<span>Page</span>
				}
			</div>
			<div class="space-x-2">
				@try {
					<Button variant="outline" size="sm" disabled={!nav.hasPrev} onClick={() => (view.page = invoices.page - 1)}>Previous</Button>
				} @pending {
					<Button variant="outline" size="sm" disabled>Previous</Button>
				}
				@try {
					<Button variant="outline" size="sm" disabled={!nav.hasNext} onClick={() => (view.page = invoices.page + 1)}>Next</Button>
				} @pending {
					<Button variant="outline" size="sm" disabled>Next</Button>
				}
			</div>
		</div>
	</div>
}
