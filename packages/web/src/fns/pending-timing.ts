// The pending-UI timing vocabulary on a subpath, so client code reads it without loading the package barrel.
export {
	MARKLESS_PENDING_MIN_VISIBLE_MS,
	MARKLESS_PENDING_SETTLE_DEADLINE_MS,
	MARKLESS_REVEAL_TRAIN_CADENCE_MS,
	settleOrPendingDeadline,
	waitMs,
	type PendingTimingClock,
} from '../pending-timing.ts';
