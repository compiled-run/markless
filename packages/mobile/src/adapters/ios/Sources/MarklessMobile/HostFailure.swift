import os

private let log = Logger(subsystem: "dev.markless.mobile", category: "host")

/// Stops the app on a host error, its message in the device's log first: `fatalError` writes it only to stderr, which a
/// simulator's or phone's log does not keep.
func hostFailed(_ message: String) -> Never {
	log.fault("Markless iOS host: \(message, privacy: .public)")
	fatalError("Markless iOS host: \(message)")
}
