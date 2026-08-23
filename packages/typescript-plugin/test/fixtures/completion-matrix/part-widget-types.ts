import type { PropsOf } from '@markless/core';

// The four prop shapes a part is written with in practice: a bare PropsOf, an Omit around
// one, an intersection with extra props, and a Pick of one.
export type WidgetRootProps = Omit<PropsOf<'div'>, 'onChange'> & { readonly open?: boolean };
export type WidgetTriggerProps = PropsOf<'button'> & { readonly value: string };
export type PanelProps = Pick<PropsOf<'section'>, 'children' | 'class'>;
// A part that takes no element props at all, so it names no element.
export type WidgetFieldProps = { readonly name?: string; readonly required?: boolean };
