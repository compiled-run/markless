// Class lists copied from shadcn/ui apps/v4/registry/new-york-v4/ui (MIT, see LICENSE-shadcn).
import { cn } from './cn.ts';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize =
	| 'default'
	| 'xs'
	| 'sm'
	| 'lg'
	| 'icon'
	| 'icon-xs'
	| 'icon-sm'
	| 'icon-lg';
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
export type AlertVariant = 'default' | 'destructive';

const button = {
	base: "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	variant: {
		default: 'bg-primary text-primary-foreground hover:bg-primary/90',
		destructive:
			'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
		outline:
			'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
		secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
		ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
		link: 'text-primary underline-offset-4 hover:underline',
	},
	size: {
		default: 'h-9 px-4 py-2 has-[>svg]:px-3',
		xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
		sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
		lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
		icon: 'size-9',
		'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
		'icon-sm': 'size-8',
		'icon-lg': 'size-10',
	},
} as const;

export function buttonVariants({
	variant = 'default',
	size = 'default',
	className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
	return cn(button.base, button.variant[variant], button.size[size], className);
}

const badge = {
	base: 'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
	variant: {
		default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
		secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
		destructive:
			'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
		outline:
			'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
		ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
		link: 'text-primary underline-offset-4 [a&]:hover:underline',
	},
} as const;

export function badgeVariants({
	variant = 'default',
	className,
}: { variant?: BadgeVariant; className?: string } = {}): string {
	return cn(badge.base, badge.variant[variant], className);
}

const alert = {
	base: 'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
	variant: {
		default: 'bg-card text-card-foreground',
		destructive:
			'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current',
	},
} as const;

export function alertVariants({
	variant = 'default',
	className,
}: { variant?: AlertVariant; className?: string } = {}): string {
	return cn(alert.base, alert.variant[variant], className);
}

export const classes = {
	card: 'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm',
	cardHeader:
		'@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
	cardTitle: 'leading-none font-semibold',
	cardDescription: 'text-sm text-muted-foreground',
	cardAction: 'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
	cardContent: 'px-6',
	cardFooter: 'flex items-center px-6 [.border-t]:pt-6',
	alertTitle: 'col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight',
	alertDescription:
		'col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed',
	separator:
		'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
	tableContainer: 'relative w-full overflow-x-auto',
	table: 'w-full caption-bottom text-sm',
	tableHeader: '[&_tr]:border-b',
	tableBody: '[&_tr:last-child]:border-0',
	tableRow:
		'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
	tableHead:
		'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
	tableCell:
		'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
	tableCaption: 'mt-4 text-sm text-muted-foreground',
	input: 'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
	skeleton: 'animate-pulse rounded-md bg-accent',
} as const;
