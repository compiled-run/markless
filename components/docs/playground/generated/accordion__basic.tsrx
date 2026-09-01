import { state } from '@markless/core';
import { accordion, collapsible, select, tabs, toggle, tooltip } from '@markless/ui';

const srcLines0 = [{"id":"l0","tokens":[{"id":"t0","plain":[{"id":"t0","text":"import","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" { accordion } ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"from","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":" '@markless/ui'","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l1","tokens":[]},{"id":"l2","tokens":[{"id":"t0","plain":[{"id":"t0","text":"export default function","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t2","plain":[],"hover":[{"id":"t2","text":"AccordionBasic","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"function AccordionBasic(): Element","doc":"","label":"function AccordionBasic(): Element"}]},{"id":"t3","plain":[{"id":"t3","text":"() ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[],"hover":[{"id":"t4","text":"@{","style":"color:#D73A49;--shiki-dark:#F97583","title":"@{ · Component body","doc":"Opens the body of a component, where ordinary statements and the markup they produce sit together.","label":"@{: Component body. Opens the body of a component, where ordinary statements and the markup they produce sit together."}]}]}];
const srcLines1 = [{"id":"t0","plain":[{"id":"t0","text":"\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.root","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function root({ value, multiple, collapsible, disabled, disableUntilFound, onChange, children, ...rest }: accordion.AccordionRootProps): Element","doc":"","label":"(alias) function root({ value, multiple, collapsible, disabled, disableUntilFound, onChange, children, ...rest }: accordion.AccordionRootProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"accordion\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"value","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) value?: string | readonly string[] | undefined","doc":"Which section is showing. A plain string names one section; with `multiple` it is the list of sections that are showing. Omit it and everything starts closed.","label":"(property) value?: string | readonly string[] | undefined. Which section is showing. A plain string names one section; with `multiple` it is the list of sections that are showing. Omit it and everything starts closed."}]},{"id":"t8","plain":[{"id":"t8","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t9s1","plain":[{"id":"t9r1","text":"\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]}];
const srcLines2 = [{"id":"t9s2","plain":[{"id":"t9r2","text":"\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t10","plain":[{"id":"t10","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}];
const srcLines3 = [{"id":"l4","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.item","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element","doc":"","label":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"section\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"value","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) value: string","doc":"This section's own name, and what the root's `value` names.","label":"(property) value: string. This section's own name, and what the root's `value` names."}]},{"id":"t8","plain":[{"id":"t8","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t9","plain":[{"id":"t9","text":"\"ship\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t10","plain":[{"id":"t10","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l5","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemlabel","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element","doc":"","label":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"heading\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l6","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemtrigger","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element","doc":"","label":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"trigger\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">When does my order ship?</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"accordion.itemtrigger","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element","doc":"","label":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element"}]},{"id":"t8","plain":[{"id":"t8","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l7","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemlabel","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element","doc":"","label":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l8","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemcontent","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element","doc":"","label":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"panel\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">Orders leave within two working days.</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"accordion.itemcontent","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element","doc":"","label":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element"}]},{"id":"t8","plain":[{"id":"t8","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l9","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.item","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element","doc":"","label":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l10","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.item","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element","doc":"","label":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"section\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"value","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) value: string","doc":"This section's own name, and what the root's `value` names.","label":"(property) value: string. This section's own name, and what the root's `value` names."}]},{"id":"t8","plain":[{"id":"t8","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t9","plain":[{"id":"t9","text":"\"returns\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t10","plain":[{"id":"t10","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l11","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemlabel","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element","doc":"","label":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"heading\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l12","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemtrigger","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element","doc":"","label":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"trigger\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">How do I return something?</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"accordion.itemtrigger","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element","doc":"","label":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element"}]},{"id":"t8","plain":[{"id":"t8","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l13","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemlabel","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element","doc":"","label":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l14","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemcontent","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element","doc":"","label":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"panel\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">Start a return from your orders page.</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"accordion.itemcontent","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element","doc":"","label":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element"}]},{"id":"t8","plain":[{"id":"t8","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l15","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.item","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element","doc":"","label":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l16","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.item","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element","doc":"","label":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"section\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"value","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) value: string","doc":"This section's own name, and what the root's `value` names.","label":"(property) value: string. This section's own name, and what the root's `value` names."}]},{"id":"t8","plain":[{"id":"t8","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t9","plain":[{"id":"t9","text":"\"overseas\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t10","plain":[{"id":"t10","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l17","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemlabel","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element","doc":"","label":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"heading\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l18","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemtrigger","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element","doc":"","label":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"trigger\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">Do you ship overseas?</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"accordion.itemtrigger","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element","doc":"","label":"(alias) function itemtrigger({ children, onClick, onKeydown, ...rest }: accordion.AccordionItemTriggerProps): Element"}]},{"id":"t8","plain":[{"id":"t8","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l19","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemlabel","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element","doc":"","label":"(alias) function itemlabel({ children, ...rest }: accordion.AccordionItemLabelProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l20","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t\t<","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.itemcontent","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element","doc":"","label":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":" ","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[],"hover":[{"id":"t3","text":"class","style":"color:#6F42C1;--shiki-dark:#B392F0","title":"(property) class?: string | undefined","doc":"","label":"(property) class?: string | undefined"}]},{"id":"t4","plain":[{"id":"t4","text":"=","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"\"panel\"","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":">Everywhere but Antarctica.</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t7","plain":[],"hover":[{"id":"t7","text":"accordion.itemcontent","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element","doc":"","label":"(alias) function itemcontent({ children, onBeforematch, ...rest }: accordion.AccordionItemContentProps): Element"}]},{"id":"t8","plain":[{"id":"t8","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l21","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t\t</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.item","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element","doc":"","label":"(alias) function item({ value, disabled, children, ...rest }: accordion.AccordionItemProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l22","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\t</","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t1","plain":[],"hover":[{"id":"t1","text":"accordion.root","style":"color:#005CC5;--shiki-dark:#79B8FF","title":"(alias) function root({ value, multiple, collapsible, disabled, disableUntilFound, onChange, children, ...rest }: accordion.AccordionRootProps): Element","doc":"","label":"(alias) function root({ value, multiple, collapsible, disabled, disableUntilFound, onChange, children, ...rest }: accordion.AccordionRootProps): Element"}]},{"id":"t2","plain":[{"id":"t2","text":">","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l23","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]}]}];
const cssLines0 = [{"id":"l0","tokens":[{"id":"t0","plain":[{"id":"t0","text":".accordion","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l1","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tdisplay","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"grid","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l2","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tgap","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"0.5","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"em","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l3","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\twidth","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"min","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"32","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"rem","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":", ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t7","plain":[{"id":"t7","text":"100","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t8","plain":[{"id":"t8","text":"%","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t9","plain":[{"id":"t9","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l4","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l5","tokens":[]},{"id":"l6","tokens":[{"id":"t0","plain":[{"id":"t0","text":".section","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l7","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tborder","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"2","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"px","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":" solid var","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":"--code-edge","style":"color:#E36209;--shiki-dark:#FFAB70"}],"hover":[]},{"id":"t7","plain":[{"id":"t7","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l8","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tborder-radius","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"6","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"px","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l9","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tbackground","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"var","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"--paper","style":"color:#E36209;--shiki-dark:#FFAB70"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l10","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\toverflow","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"clip","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l11","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l12","tokens":[]},{"id":"l13","tokens":[{"id":"t0","plain":[{"id":"t0","text":".section","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":"[","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"ui-open","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"] {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l14","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tborder-color","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"var","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"--pink","style":"color:#E36209;--shiki-dark:#FFAB70"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l15","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l16","tokens":[]},{"id":"l17","tokens":[{"id":"t0","plain":[{"id":"t0","text":".heading","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l18","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tmargin","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"0","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l19","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tfont-size","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"var","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"--step-0","style":"color:#E36209;--shiki-dark:#FFAB70"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l20","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l21","tokens":[]},{"id":"l22","tokens":[{"id":"t0","plain":[{"id":"t0","text":".trigger","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l23","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tdisplay","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"flex","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l24","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tgap","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"0.6","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"em","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l25","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\talign-items","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"center","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l26","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tjustify-content","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"space-between","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l27","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\twidth","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"100","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"%","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l28","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tpadding","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"0.6","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"em","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":" 0.8","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"em","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l29","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tborder","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"0","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l30","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tbackground","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"transparent","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l31","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tcolor","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"var","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"--ink","style":"color:#E36209;--shiki-dark:#FFAB70"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l32","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tfont","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"inherit","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l33","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tfont-weight","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"700","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l34","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\ttext-align","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"left","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l35","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tcursor","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"pointer","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l36","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l37","tokens":[]},{"id":"l38","tokens":[{"id":"t0","plain":[{"id":"t0","text":".trigger::after","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l39","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tcontent","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"'▾'","style":"color:#032F62;--shiki-dark:#9ECBFF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l40","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\ttransition","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": transform ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"140","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"ms","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":" ease","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l41","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l42","tokens":[]},{"id":"l43","tokens":[{"id":"t0","plain":[{"id":"t0","text":".trigger","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":"[","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"ui-open","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"]","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"::after","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l44","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\ttransform","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"rotate","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"180","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"deg","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l45","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l46","tokens":[]},{"id":"l47","tokens":[{"id":"t0","plain":[{"id":"t0","text":".trigger:hover","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l48","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tbackground","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"var","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"--tinted-quiet","style":"color:#E36209;--shiki-dark:#FFAB70"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l49","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l50","tokens":[]},{"id":"l51","tokens":[{"id":"t0","plain":[{"id":"t0","text":".trigger:disabled","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l52","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tcursor","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"not-allowed","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l53","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\topacity","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"0.55","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l54","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l55","tokens":[]},{"id":"l56","tokens":[{"id":"t0","plain":[{"id":"t0","text":".panel","style":"color:#6F42C1;--shiki-dark:#B392F0"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":" {","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l57","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tpadding","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"0 0.8","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"em","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":" 0.7","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":"em","style":"color:#D73A49;--shiki-dark:#F97583"}],"hover":[]},{"id":"t6","plain":[{"id":"t6","text":";","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l58","tokens":[{"id":"t0","plain":[{"id":"t0","text":"\tfont-size","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t1","plain":[{"id":"t1","text":": ","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t2","plain":[{"id":"t2","text":"var","style":"color:#005CC5;--shiki-dark:#79B8FF"}],"hover":[]},{"id":"t3","plain":[{"id":"t3","text":"(","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]},{"id":"t4","plain":[{"id":"t4","text":"--step--1","style":"color:#E36209;--shiki-dark:#FFAB70"}],"hover":[]},{"id":"t5","plain":[{"id":"t5","text":");","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]},{"id":"l59","tokens":[{"id":"t0","plain":[{"id":"t0","text":"}","style":"color:var(--ink);--shiki-dark:var(--ink)"}],"hover":[]}]}];
const presets: Readonly<Record<string, Readonly<Record<string, string | boolean>>>> = {
	"basic": { label: "Basic", cMultiple: false, tMultiple: "false", cCollapsible: true, tCollapsible: "true", cDisabled: false, tDisabled: "false", cDisableUntilFound: false, tDisableUntilFound: "false", cValue: "ship", tValue: "ship" },
	"multiple": { label: "Multiple", cMultiple: true, tMultiple: "true", cCollapsible: true, tCollapsible: "true", cDisabled: false, tDisabled: "false", cDisableUntilFound: false, tDisableUntilFound: "false", cValue: "ship", tValue: "ship" },
	"locked": { label: "Locked", cMultiple: false, tMultiple: "false", cCollapsible: true, tCollapsible: "true", cDisabled: true, tDisabled: "true", cDisableUntilFound: false, tDisableUntilFound: "false", cValue: "ship", tValue: "ship" },
	"find": { label: "Find in page", cMultiple: false, tMultiple: "false", cCollapsible: true, tCollapsible: "true", cDisabled: false, tDisabled: "false", cDisableUntilFound: true, tDisableUntilFound: "true", cValue: "", tValue: "" },
};

export default function AccordionBasicPlayground() @{
	let cMultiple = state(false);
	let tMultiple = state("false");
	let cCollapsible = state(true);
	let tCollapsible = state("true");
	let cDisabled = state(false);
	let tDisabled = state("false");
	let cDisableUntilFound = state(false);
	let tDisableUntilFound = state("false");
	let cValue = state("ship");
	let tValue = state("ship");
	let logging = state(false);
	let tLogging = state("false");
	let events = state(0);
	let logClass = state('pg-log pg-log-quiet');
	let scenario = state("Basic");
	let scenarioName = state("basic");

	<section class="pg">
		<collapsible.root class="pg-controls">
			<div class="pg-quick">
				<div class="pg-cell">
					<toggle.root
						class="pg-ctl"
						checked={cMultiple}
						onChange={(next: boolean) => {
							cMultiple = next;
							tMultiple = next ? 'true' : 'false';
						}}
					>
						<toggle.label class="pg-name">multiple</toggle.label>
						<toggle.trigger class="pg-switch">
							<toggle.thumb class="pg-knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="pg-state">{tMultiple}</span>
					<tooltip.root class="pg-hint">
						<tooltip.trigger class="pg-dot" aria-label="Type of multiple">?</tooltip.trigger>
						<tooltip.content class="pg-tip">{"boolean"}</tooltip.content>
					</tooltip.root>
				</div>

				<div class="pg-cell">
					<toggle.root
						class="pg-ctl"
						checked={cCollapsible}
						onChange={(next: boolean) => {
							cCollapsible = next;
							tCollapsible = next ? 'true' : 'false';
						}}
					>
						<toggle.label class="pg-name">collapsible</toggle.label>
						<toggle.trigger class="pg-switch">
							<toggle.thumb class="pg-knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="pg-state">{tCollapsible}</span>
					<tooltip.root class="pg-hint">
						<tooltip.trigger class="pg-dot" aria-label="Type of collapsible">?</tooltip.trigger>
						<tooltip.content class="pg-tip">{"boolean"}</tooltip.content>
					</tooltip.root>
				</div>

				<div class="pg-cell">
					<toggle.root
						class="pg-ctl"
						checked={cDisabled}
						onChange={(next: boolean) => {
							cDisabled = next;
							tDisabled = next ? 'true' : 'false';
						}}
					>
						<toggle.label class="pg-name">disabled</toggle.label>
						<toggle.trigger class="pg-switch">
							<toggle.thumb class="pg-knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="pg-state">{tDisabled}</span>
					<tooltip.root class="pg-hint">
						<tooltip.trigger class="pg-dot" aria-label="Type of disabled">?</tooltip.trigger>
						<tooltip.content class="pg-tip">{"boolean"}</tooltip.content>
					</tooltip.root>
				</div>

				<collapsible.trigger class="pg-showall">Show all</collapsible.trigger>
			</div>

			<collapsible.content class="pg-rest">
				<div class="pg-cell">
					<toggle.root
						class="pg-ctl"
						checked={cDisableUntilFound}
						onChange={(next: boolean) => {
							cDisableUntilFound = next;
							tDisableUntilFound = next ? 'true' : 'false';
						}}
					>
						<toggle.label class="pg-name">disableUntilFound</toggle.label>
						<toggle.trigger class="pg-switch">
							<toggle.thumb class="pg-knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="pg-state">{tDisableUntilFound}</span>
					<tooltip.root class="pg-hint">
						<tooltip.trigger class="pg-dot" aria-label="Type of disableUntilFound">?</tooltip.trigger>
						<tooltip.content class="pg-tip">{"boolean"}</tooltip.content>
					</tooltip.root>
				</div>

				<div class="pg-cell">
					<select.root
						class="pg-ctl pg-pick"
						value={cValue}
						onChange={(next: string) => {
							cValue = next;
							tValue = next;
						}}
					>
						<select.label class="pg-name">value</select.label>
						<select.trigger class="pg-pick-trigger">
							<span class="pg-pick-value">{tValue}</span>
						</select.trigger>
						<select.content class="pg-pick-list">
							<select.item class="pg-pick-item" value="ship">
								<select.itemlabel>ship</select.itemlabel>
							</select.item>
							<select.item class="pg-pick-item" value="returns">
								<select.itemlabel>returns</select.itemlabel>
							</select.item>
							<select.item class="pg-pick-item" value="overseas">
								<select.itemlabel>overseas</select.itemlabel>
							</select.item>
							<select.item class="pg-pick-item" value="">
								<select.itemlabel>(none)</select.itemlabel>
							</select.item>
						</select.content>
					</select.root>
					<tooltip.root class="pg-hint">
						<tooltip.trigger class="pg-dot" aria-label="Type of value">?</tooltip.trigger>
						<tooltip.content class="pg-tip">{"string | readonly string[]"}</tooltip.content>
					</tooltip.root>
				</div>

				<div class="pg-cell">
					<toggle.root
						class="pg-ctl"
						checked={logging}
						onChange={(next: boolean) => {
							logging = next;
							tLogging = next ? 'true' : 'false';
							logClass = next ? 'pg-log' : 'pg-log pg-log-quiet';
						}}
					>
						<toggle.label class="pg-name">onChange</toggle.label>
						<toggle.trigger class="pg-switch">
							<toggle.thumb class="pg-knob" />
						</toggle.trigger>
					</toggle.root>
					<span class="pg-state">{tLogging}</span>
					<tooltip.root class="pg-hint">
						<tooltip.trigger class="pg-dot" aria-label="Type of onChange">?</tooltip.trigger>
						<tooltip.content class="pg-tip">{"(value: string | readonly string[]) => void"}</tooltip.content>
					</tooltip.root>
				</div>
			</collapsible.content>
		</collapsible.root>

		<p class={logClass}>onChange called {events} time(s)</p>

		<div class="pg-stage">
			<accordion.root
					class="accordion"
					value={cValue}
					multiple={cMultiple}
					collapsible={cCollapsible}
					disabled={cDisabled}
					disableUntilFound={cDisableUntilFound}
					onChange={(next: string | readonly string[]) => {
						const shown = typeof next === 'string' ? next : (next[0] ?? '');
						cValue = shown;
						tValue = shown;
						events = logging ? events + 1 : events;
					}}
				>
		<accordion.item class="section" value="ship">
			<accordion.itemlabel class="heading">
				<accordion.itemtrigger class="trigger">When does my order ship?</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="panel">Orders leave within two working days.</accordion.itemcontent>
		</accordion.item>
		<accordion.item class="section" value="returns">
			<accordion.itemlabel class="heading">
				<accordion.itemtrigger class="trigger">How do I return something?</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="panel">Start a return from your orders page.</accordion.itemcontent>
		</accordion.item>
		<accordion.item class="section" value="overseas">
			<accordion.itemlabel class="heading">
				<accordion.itemtrigger class="trigger">Do you ship overseas?</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent class="panel">Everywhere but Antarctica.</accordion.itemcontent>
		</accordion.item>
	</accordion.root>
		</div>

		<div class="pg-bar">
			<select.root
				class="pg-pick pg-bar-pick"
				value={scenarioName}
				onChange={(next: string) => {
					const preset = presets[next];
					scenarioName = next;
					scenario = preset.label as string;
							cMultiple = preset["cMultiple"] as boolean;
							tMultiple = preset["tMultiple"] as string;
							cCollapsible = preset["cCollapsible"] as boolean;
							tCollapsible = preset["tCollapsible"] as string;
							cDisabled = preset["cDisabled"] as boolean;
							tDisabled = preset["tDisabled"] as string;
							cDisableUntilFound = preset["cDisableUntilFound"] as boolean;
							tDisableUntilFound = preset["tDisableUntilFound"] as string;
							cValue = preset["cValue"] as string;
							tValue = preset["tValue"] as string;
				}}
			>
				<select.label class="pg-bar-name">Scenario</select.label>
				<select.trigger class="pg-pick-trigger pg-bar-trigger">
					<span class="pg-pick-value">{scenario}</span>
				</select.trigger>
				<select.content class="pg-pick-list pg-bar-list">
						<select.item class="pg-pick-item" value="basic">
							<select.itemlabel>Basic</select.itemlabel>
						</select.item>
						<select.item class="pg-pick-item" value="multiple">
							<select.itemlabel>Multiple</select.itemlabel>
						</select.item>
						<select.item class="pg-pick-item" value="locked">
							<select.itemlabel>Locked</select.itemlabel>
						</select.item>
						<select.item class="pg-pick-item" value="find">
							<select.itemlabel>Find in page</select.itemlabel>
						</select.item>
				</select.content>
			</select.root>
		</div>

		<div class="pg-code">
			<div class="pg-panel-outer" data-scenario="accordion/basic">
				<tabs.root class="pg-panel" value="source">
					<tabs.list class="pg-strip">
						<div class="pg-strip-row" role="presentation">
							<tabs.trigger class="pg-tab" value="source">basic.tsrx</tabs.trigger>
					<tabs.trigger class="pg-tab" value="css">accordion.css</tabs.trigger>
						</div>
					</tabs.list>
					<div class="pg-panes">
						<tabs.content class="pg-pane" value="source">
							<collapsible.root class="pg-clamp">
								<div class="pg-code-body">
									<pre class="pg-shiki">
									@for (const line of srcLines0; key line.id) {
										<span class="pg-line">
											@for (const token of line.tokens; key token.id) {
												<span class="pg-run">
													@for (const run of token.plain; key run.id) {
														<span style={run.style}>{run.text}</span>
													}
													@for (const run of token.hover; key run.id) {
														<span class="tsrx-hover" tabindex="0" role="img" aria-label={run.label} data-doc-title={run.title} data-doc={run.doc}><span style={run.style}>{run.text}</span><span class="tsrx-tip" aria-hidden="true"><span class="tsrx-tip-title">{run.title}</span><span class="tsrx-tip-body">{run.doc}</span></span></span>
													}
												</span>
											}
										</span>
									}
									<span class="pg-line">
										@for (const token of srcLines1; key token.id) {
											<span class="pg-run">
												@for (const run of token.plain; key run.id) {
													<span style={run.style}>{run.text}</span>
												}
												@for (const run of token.hover; key run.id) {
													<span class="tsrx-hover" tabindex="0" role="img" aria-label={run.label} data-doc-title={run.title} data-doc={run.doc}><span style={run.style}>{run.text}</span><span class="tsrx-tip" aria-hidden="true"><span class="tsrx-tip-title">{run.title}</span><span class="tsrx-tip-body">{run.doc}</span></span></span>
												}
											</span>
										}
										<span class="pg-run"><span style="color:#032F62;--shiki-dark:#9ECBFF">{tValue}</span></span>
										@for (const token of srcLines2; key token.id) {
											<span class="pg-run">
												@for (const run of token.plain; key run.id) {
													<span style={run.style}>{run.text}</span>
												}
												@for (const run of token.hover; key run.id) {
													<span class="tsrx-hover" tabindex="0" role="img" aria-label={run.label} data-doc-title={run.title} data-doc={run.doc}><span style={run.style}>{run.text}</span><span class="tsrx-tip" aria-hidden="true"><span class="tsrx-tip-title">{run.title}</span><span class="tsrx-tip-body">{run.doc}</span></span></span>
												}
											</span>
										}
									</span>
									@for (const line of srcLines3; key line.id) {
										<span class="pg-line">
											@for (const token of line.tokens; key token.id) {
												<span class="pg-run">
													@for (const run of token.plain; key run.id) {
														<span style={run.style}>{run.text}</span>
													}
													@for (const run of token.hover; key run.id) {
														<span class="tsrx-hover" tabindex="0" role="img" aria-label={run.label} data-doc-title={run.title} data-doc={run.doc}><span style={run.style}>{run.text}</span><span class="tsrx-tip" aria-hidden="true"><span class="tsrx-tip-title">{run.title}</span><span class="tsrx-tip-body">{run.doc}</span></span></span>
													}
												</span>
											}
										</span>
									}
									</pre>
								</div>
								<span class="pg-fade" aria-hidden="true"></span>
								<collapsible.trigger class="pg-expand">Expand code</collapsible.trigger>
							</collapsible.root>
						</tabs.content>
					<tabs.content class="pg-pane" value="css">
						<collapsible.root class="pg-clamp">
							<div class="pg-code-body">
								<pre class="pg-shiki">
									@for (const line of cssLines0; key line.id) {
										<span class="pg-line">
											@for (const token of line.tokens; key token.id) {
												<span class="pg-run">
													@for (const run of token.plain; key run.id) {
														<span style={run.style}>{run.text}</span>
													}
													@for (const run of token.hover; key run.id) {
														<span class="tsrx-hover" tabindex="0" role="img" aria-label={run.label} data-doc-title={run.title} data-doc={run.doc}><span style={run.style}>{run.text}</span><span class="tsrx-tip" aria-hidden="true"><span class="tsrx-tip-title">{run.title}</span><span class="tsrx-tip-body">{run.doc}</span></span></span>
													}
												</span>
											}
										</span>
									}
								</pre>
							</div>
							<span class="pg-fade" aria-hidden="true"></span>
							<collapsible.trigger class="pg-expand">Expand code</collapsible.trigger>
						</collapsible.root>
					</tabs.content>
					</div>
				</tabs.root>
			</div>
		</div>

		<style>
			.pg {
				display: grid;
				margin-block: var(--space-s);
				border: 2px solid var(--code-edge);
				border-radius: 10px;
				background: var(--raised);
				overflow: clip;
			}

			.pg-controls {
				display: grid;
				gap: 0.5em;
				padding: 0.7em 0.9em;
				border-block-end: 2px solid var(--code-edge);
			}

			.pg-quick,
			.pg-rest {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em 1.1em;
				align-items: center;
			}

			.pg-rest {
				padding-block-start: 0.6em;
				border-block-start: 2px dashed var(--code-edge);
			}

			.pg-rest[ui-closed] {
				display: none;
			}

			.pg-cell {
				display: flex;
				gap: 0.4em;
				align-items: center;
			}

			.pg-ctl {
				display: flex;
				gap: 0.45em;
				align-items: center;
			}

			.pg-state {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				line-height: 1.3;
				color: var(--ink);
				opacity: 0.65;
			}

			.pg-name {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				line-height: 1.3;
				color: var(--ink);
			}

			.pg-switch {
				display: flex;
				align-items: center;
				width: 2.4em;
				height: 1.3em;
				padding: 0.12em;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				cursor: pointer;
			}

			.pg-switch[ui-checked] {
				background: var(--yellow);
			}

			.pg-switch:disabled {
				cursor: not-allowed;
				opacity: 0.55;
			}

			.pg-knob {
				display: block;
				width: 0.95em;
				height: 0.95em;
				border-radius: 999px;
				background: var(--ink);
				transition: transform 130ms ease;
			}

			.pg-switch[ui-checked] .pg-knob {
				transform: translateX(1.1em);
			}

			.pg-field {
				min-width: 7em;
				padding: 0.2em 0.5em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--font-mono);
				font-size: var(--step--1);
			}

			.pg-hint {
				position: relative;
				display: inline-flex;
				align-items: center;
			}

			.pg-dot {
				display: grid;
				place-items: center;
				width: 1.15em;
				height: 1.15em;
				padding: 0;
				border: 2px solid var(--code-edge);
				border-radius: 999px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--2);
				line-height: 1;
				cursor: help;
			}

			.pg-tip {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 6;
				width: max-content;
				max-width: 14rem;
				margin-block-start: 0.3em;
				padding: 0.25em 0.55em;
				border-radius: 4px;
				background: var(--slab);
				color: var(--slab-ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
			}

			.pg-tip[ui-closed] {
				display: none;
			}

			.pg-showall {
				margin-inline-start: auto;
				padding: 0.2em 0.5em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				cursor: pointer;
			}

			.pg-showall::after {
				content: ' \203A';
			}

			.pg-showall[ui-open]::after {
				content: ' \2304';
			}

			.pg-pick {
				position: relative;
			}

			.pg-pick-trigger {
				min-width: 6.5em;
				padding: 0.25em 0.6em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				text-align: start;
				cursor: pointer;
			}

			.pg-pick-list {
				position: absolute;
				inset-block-start: 100%;
				inset-inline-start: 0;
				z-index: 5;
				min-width: 8em;
				margin-block-start: 0.25em;
				padding: 0.2em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
			}

			.pg-pick-list[ui-closed] {
				display: none;
			}

			.pg-pick-item {
				padding: 0.25em 0.5em;
				border-radius: 4px;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				cursor: pointer;
			}

			.pg-pick-item:hover,
			.pg-pick-item[ui-selected] {
				background: var(--tinted);
			}

			.pg-log {
				margin: 0;
				padding: 0.5em 0.9em 0;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				color: var(--ink);
			}

			.pg-log-quiet {
				display: none;
			}

			.pg-stage {
				display: grid;
				place-items: center;
				min-height: 15rem;
				padding: var(--space-s);
				background: var(--paper);
			}

			.pg-bar {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em 1em;
				justify-content: end;
				padding: 0.6em 0.9em;
				border-block-start: 2px solid var(--code-edge);
			}

			.pg-bar-pick {
				display: grid;
				gap: 0.2em;
				justify-items: start;
			}

			.pg-bar-name {
				font-size: var(--step--2);
				font-weight: 700;
				letter-spacing: 0.04em;
				color: var(--ink);
			}

			.pg-bar-trigger {
				display: flex;
				gap: 0.6em;
				align-items: center;
				justify-content: space-between;
				min-width: 8.5em;
			}

			.pg-bar-trigger::after {
				content: '\2304';
			}

			/* The bar is the last row of a clipped container, so its list opens up. */
			.pg-bar-list {
				inset-block-start: auto;
				inset-block-end: 100%;
				margin-block: 0 0.25em;
			}

			.pg-code {
				border-block-start: 2px solid var(--code-edge);
				background: var(--code-surface);
			}

			.pg-panel {
				display: block;
				background: var(--raised);
				overflow: clip;
			}

			.pg-strip {
				padding: 0.35em 0.5em 0;
				border-block-end: 1px solid var(--code-edge);
			}

			.pg-strip-row {
				display: flex;
				gap: 0.2em;
			}

			.pg-tab {
				padding: 0.25em 0.75em;
				border: 0;
				border-radius: 6px 6px 0 0;
				background: transparent;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				opacity: 0.6;
				cursor: pointer;
			}

			.pg-tab[ui-selected] {
				background: var(--paper);
				opacity: 1;
				font-weight: 700;
			}

			/* The clamp: the code always shows, and opening only lifts the ceiling. */
			.pg-clamp {
				position: relative;
			}

			.pg-code-body {
				max-height: 150px;
				overflow: clip;
			}

			.pg-clamp[ui-open] .pg-code-body {
				max-height: none;
				overflow: visible;
			}

			.pg-shiki {
				margin: 0;
				padding: var(--space-s);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 160%;
				overflow-x: auto;
			}

			.pg-line {
				display: block;
				white-space: pre;
			}

			.pg-fade {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5rem;
				background: linear-gradient(to bottom, transparent, var(--raised) 70%);
				pointer-events: none;
			}

			/* The whole faded strip is the target, so a reader can click the code
			   they cannot read yet rather than hunting for a small control. */
			.pg-expand {
				position: absolute;
				inset-inline: 0;
				bottom: 0;
				height: 5rem;
				display: flex;
				align-items: flex-end;
				justify-content: center;
				padding-bottom: 0.6em;
				border: 0;
				background: transparent;
				color: var(--ink);
				font: inherit;
				font-size: var(--step--1);
				font-weight: 700;
				cursor: pointer;
			}

			.pg-clamp[ui-open] .pg-fade,
			.pg-clamp[ui-open] .pg-expand {
				display: none;
			}

			@media (max-width: 866px) {
				.pg {
					border-inline: 0;
					border-radius: 0;
				}

				.pg-quick,
				.pg-rest {
					flex-direction: column;
					align-items: start;
				}

				.pg-showall {
					margin-inline-start: 0;
				}

				.pg-bar {
					justify-content: start;
				}
			}

.accordion {
	display: grid;
	gap: 0.5em;
	width: min(32rem, 100%);
}

.section {
	border: 2px solid var(--code-edge);
	border-radius: 6px;
	background: var(--paper);
	overflow: clip;
}

.section[ui-open] {
	border-color: var(--pink);
}

.heading {
	margin: 0;
	font-size: var(--step-0);
}

.trigger {
	display: flex;
	gap: 0.6em;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	padding: 0.6em 0.8em;
	border: 0;
	background: transparent;
	color: var(--ink);
	font: inherit;
	font-weight: 700;
	text-align: left;
	cursor: pointer;
}

.trigger::after {
	content: '▾';
	transition: transform 140ms ease;
}

.trigger[ui-open]::after {
	transform: rotate(180deg);
}

.trigger:hover {
	background: var(--tinted-quiet);
}

.trigger:disabled {
	cursor: not-allowed;
	opacity: 0.55;
}

.panel {
	padding: 0 0.8em 0.7em;
	font-size: var(--step--1);
}
		</style>
	</section>
}
