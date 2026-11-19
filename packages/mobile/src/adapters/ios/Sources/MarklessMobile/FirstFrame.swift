#if canImport(UIKit)
import Foundation
import QuartzCore

/// Logs once per process, under `MarklessScript`: `first frame <ms> ms (process start), <ms> ms (first controller created)`,
/// measured to the end of the main run-loop turn that committed the first screen's laid-out views to the render server.
@MainActor
enum FirstFrame {
	private static var created: ContinuousClock.Instant?
	private static var waiting = false

	static func controllerCreated() {
		if created == nil { created = ContinuousClock.now }
	}

	static func laidOut() {
		guard !waiting, created != nil else { return }
		waiting = true
		// Core Animation commits in its own `beforeWaiting` observer (order 2000000); this one runs after it in the same turn.
		let observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, false, CFIndex.max) { observer, _ in
			CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .commonModes)
			MainActor.assumeIsolated { log() }
		}
		CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
	}

	private static func log() {
		guard let created else { return }
		let sinceController = milliseconds(ContinuousClock.now - created)
		let sinceProcess = processStart().map { String(format: "%.1f", (Date().timeIntervalSince1970 - $0) * 1000) } ?? "unknown"
		MarklessScripting.logger.log("first frame \(sinceProcess, privacy: .public) ms (process start), \(sinceController, privacy: .public) ms (first controller created)")
	}

	private static func processStart() -> TimeInterval? {
		var info = kinfo_proc()
		var size = MemoryLayout<kinfo_proc>.stride
		var name: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
		guard sysctl(&name, 4, &info, &size, nil, 0) == 0 else { return nil }
		let start = info.kp_proc.p_starttime
		return TimeInterval(start.tv_sec) + TimeInterval(start.tv_usec) / 1_000_000
	}

	private static func milliseconds(_ duration: Duration) -> String {
		let (seconds, attoseconds) = duration.components
		return String(format: "%.1f", Double(seconds) * 1000 + Double(attoseconds) / 1e15)
	}
}
#endif
