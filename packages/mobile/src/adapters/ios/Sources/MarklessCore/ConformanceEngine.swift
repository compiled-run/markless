import Foundation

/// A vector as the conformance writer leaves it, markers where the phone engine goes, with the engine text put back
/// (files services.js and entries.js beside the vectors).
public enum ConformanceEngine {
	private static let markers = [("/*markless-engine:services*/", "services.js"), ("/*markless-engine:entries*/", "entries.js")]

	public static func put(_ vector: String, read: (String) throws -> String) throws -> String {
		var text = vector
		for (marker, name) in markers where text.contains(marker) {
			var engine = try read(name)
			if engine.hasSuffix("\n") { engine.removeLast() }
			let quoted = String(decoding: try JSONEncoder().encode(engine), as: UTF8.self)
			text = text.replacingOccurrences(of: marker, with: String(quoted.dropFirst().dropLast()))
		}
		return text
	}

	/// A vector file's JSON with the engine put back from the `engine` folder beside it.
	public static func vectorData(_ file: URL) throws -> Data {
		let engine = file.deletingLastPathComponent().appendingPathComponent("engine")
		let text = try put(String(contentsOf: file, encoding: .utf8)) { name in
			try String(contentsOf: engine.appendingPathComponent(name), encoding: .utf8)
		}
		return Data(text.utf8)
	}
}
