import { cn } from './cn.ts';

export default function Skeleton({ class: className }: { class?: string }) @{
	<div data-slot="skeleton" class={cn('animate-pulse rounded-md bg-accent', className)}></div>
}
