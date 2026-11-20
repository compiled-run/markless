import Foundation

/// A host service a payload's script uses; a host provides only those it names.
public enum NativeScriptService: String, Sendable {
	case timers, fetch, console, crypto, navigate, device
}

/// The JavaScript a payload's `script` ops and script computeds run, in the platform's engine, started on first use.
public struct NativeScript: Equatable, Sendable {
	/// Content hash of `source`: the engine keeps the script under `globalThis.__markless[id]`.
	public let id: String
	public let source: String
	public let services: [NativeScriptService]
}

/// What one name of a script function means where it runs.
public struct NativeScriptBinding: Equatable, Sendable {
	public enum Kind: Equatable, Sendable {
		/// A cell it reads and writes; inside a list row, that row's value (`<cell>@<key>`).
		case cell(String)
		/// A state object: one cell per field.
		case fields([NativeScriptField])
		/// A value it only reads.
		case value(NativeExpr)
		/// A device object the component made: the script calls its methods through `call` entries.
		case device(device: String, object: String)
	}
	public let name: String
	public let kind: Kind

	var cells: [String] {
		switch kind {
		case let .cell(cell): return [cell]
		case let .fields(fields): return fields.map(\.cell)
		case let .value(expr): return expr.cells
		case .device: return []
		}
	}
}

public struct NativeScriptField: Equatable, Sendable {
	public let name: String
	public let cell: String
}

public struct NativeHeader: Equatable, Sendable {
	public let name: String
	public let value: String
	public init(name: String, value: String) {
		self.name = name
		self.value = value
	}
}

/// A request as the script made it: an absolute URL and a text body.
public struct NativeFetchRequest: Equatable, Sendable {
	public let url: String
	public let method: String
	public let headers: [NativeHeader]
	public let body: String?

	var json: JSONValue {
		.object([
			("url", .string(url)), ("method", .string(method)),
			("headers", .array(headers.map { .array([.string($0.name), .string($0.value)]) })),
			("body", body.map(JSONValue.string) ?? .null),
		])
	}
}

/// What a host answers a `fetch` entry with: the response with its body as text, or the network error's message.
public enum NativeFetchResponse: Equatable, Sendable {
	case response(status: Int, statusText: String, headers: [NativeHeader], body: String)
	case error(String)

	var json: JSONValue {
		switch self {
		case let .response(status, statusText, headers, body):
			return .object([
				("status", .number(Double(status))), ("statusText", .string(statusText)),
				("headers", .array(headers.map { .array([.string($0.name), .string($0.value)]) })), ("body", .string(body)),
			])
		case let .error(message): return .object([("error", .string(message))])
		}
	}

	static func decode(_ reader: Reader) throws -> NativeFetchResponse {
		if try reader.keys() == ["error"] { return .error(try reader.field("error").string()) }
		let fields = try reader.object(["status", "statusText", "headers", "body"])
		return .response(
			status: try wholeNumber(fields["status"]), statusText: try fields["statusText"].string(),
			headers: try decodeHeaders(fields["headers"]), body: try fields["body"].string())
	}
}

func wholeNumber(_ reader: Reader) throws -> Int {
	let number = try reader.number()
	guard number == number.rounded(), abs(number) < 1e15 else { throw reader.fail("expected a whole number") }
	return Int(number)
}

func decodeHeaders(_ reader: Reader) throws -> [NativeHeader] {
	try reader.array().map { pair in
		let parts = try pair.array()
		guard parts.count == 2 else { throw pair.fail("a header is [name, value]") }
		return NativeHeader(name: try parts[0].string(), value: try parts[1].string())
	}
}

/// A JavaScript engine as a host runs a payload's script: one persistent global scope; `evaluate` runs source as a script,
/// lets the Promise jobs it queued run, and returns `String()` of the completion value. A JavaScript throw is thrown.
public protocol ScriptEngine: AnyObject {
	func evaluate(_ source: String) throws -> String
}

public struct ScriptError: Error, CustomStringConvertible, Equatable {
	public let description: String
	public init(_ description: String) { self.description = description }
}

/// The app's script engine: one per process, created the first time a screen needs it, each script's source evaluated
/// once. Screens share it; `starts` counts how often an engine was created.
public final class NativeScriptHost {
	private let makeEngine: () throws -> ScriptEngine
	private let makeSeed: () -> String
	public private(set) var engine: ScriptEngine?
	public private(set) var starts = 0
	private var loaded: Set<String> = []
	private var entered = false
	/// Where the script's `console` lines go, as `(level, text)`.
	public var log: (String, String) -> Void = { _, _ in }
	/// Where the host's own timing lines go: `engine start <ms> ms`, `first script entry <ms> ms (engine cold|warm)`.
	public var report: (String) -> Void = { _ in }
	/// Called after each engine creation.
	public var started: () -> Void = {}

	/// `seed`: 64 hex characters from a secure random source, asked for once per entry of a script that uses `crypto`.
	public init(engine: @escaping () throws -> ScriptEngine, seed: @escaping () -> String) {
		makeEngine = engine
		makeSeed = seed
	}

	/// The engine with `script` evaluated in it, creating the engine on first use.
	@discardableResult
	public func load(_ script: NativeScript) throws -> ScriptEngine {
		if let engine, loaded.contains(script.id) { return engine }
		let clock = ContinuousClock()
		let began = clock.now
		let engine: ScriptEngine
		let created = self.engine == nil
		if let existing = self.engine {
			engine = existing
		} else {
			engine = try makeEngine()
			self.engine = engine
			starts += 1
		}
		_ = try engine.evaluate(script.source)
		loaded.insert(script.id)
		report("\(created ? "engine start" : "script \(script.id) loaded") \(milliseconds(clock.now - began)) ms")
		if created { started() }
		return engine
	}

	func seed() -> String { makeSeed() }

	/// Runs one engine entry; the first in the app reports its duration and whether the engine was already up.
	func entry<T>(_ body: () throws -> T) rethrows -> T {
		if entered { return try body() }
		entered = true
		let cold = engine == nil
		let clock = ContinuousClock()
		let began = clock.now
		let result = try body()
		report("first script entry \(milliseconds(clock.now - began)) ms (engine \(cold ? "cold" : "warm"))")
		return result
	}
}

private func milliseconds(_ duration: Duration) -> String {
	let (seconds, attoseconds) = duration.components
	return String(format: "%.2f", Double(seconds) * 1000 + Double(attoseconds) / 1e15)
}
