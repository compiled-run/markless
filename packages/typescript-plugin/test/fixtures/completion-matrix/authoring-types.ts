import type { Children, PropsOf } from '@markless/core';

type ButtonIntrinsic =
	import('@markless/typescript-plugin/jsx-runtime').JSX.IntrinsicElements['button'];
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// PropsOf<'button'> is the intrinsic <button> props: no more, no less.
export const propsOfButtonIsExact: MutuallyAssignable<PropsOf<'button'>, ButtonIntrinsic> = true;
export const buttonType: PropsOf<'button'>['type'] = 'submit';
export const labelFor: PropsOf<'label'>['for'] = 'field-id';

export const textChild: Children = 'text';
export const numberChild: Children = 1;
export const listChild: Children = ['a', 2, null];
export const emptyChild: Children = null;
export const absentChild: Children = undefined;
