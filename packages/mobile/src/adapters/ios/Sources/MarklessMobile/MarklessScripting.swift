import Foundation
import MarklessCore
import os
import Security

/// The app's one script engine (JavaScriptCore), shared by every screen, and the services its scripts ask for: `fetch`
/// through `URLSession` and `console` lines in the system log under the category `MarklessScript`. Its timers are the
/// page's `timer` entries, which the view tree schedules as it does a data timer.
///
/// Warming: a screen whose payload has a script starts the engine and loads the script once its first frame is up and
/// the main run loop is idle. The Info.plist boolean `MarklessEngineWarm` set to false turns that off (the engine then
/// starts on the first script entry), which is how a test build measures a cold start.
@MainActor
public final class MarklessScripting {
	public static let shared = MarklessScripting()
	public let host: NativeScriptHost
	/// Called after each engine creation with the app's count of them.
	public var engineStarted: ((Int) -> Void)?
	private var answers: [Int: (NativeFetchResponse) -> Void] = [:]
	private var nextAnswer = 0
	private var warming: Set<String> = []
	private let session = URLSession(configuration: .ephemeral)
	nonisolated static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "markless", category: "MarklessScript")

	private init() {
		host = NativeScriptHost(engine: { try JavaScriptCoreEngine() }, seed: MarklessScripting.secureSeed)
		host.log = { level, text in
			MarklessScripting.logger.log(level: level == "error" ? .error : .default, "\(level, privacy: .public): \(text, privacy: .public)")
		}
		host.report = { line in MarklessScripting.logger.log("\(line, privacy: .public)") }
		host.started = { [weak self] in
			MainActor.assumeIsolated {
				guard let self else { return }
				self.engineStarted?(self.host.starts)
			}
		}
	}

	nonisolated static var warmsAtIdle: Bool { Bundle.main.object(forInfoDictionaryKey: "MarklessEngineWarm") as? Bool ?? true }

	/// Starts the engine and loads `script` the next time the main run loop is about to wait, unless the build turned it off.
	func warm(_ script: NativeScript) {
		guard Self.warmsAtIdle, warming.insert(script.id).inserted else { return }
		let observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, false, 0) { observer, _ in
			CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .defaultMode)
			MainActor.assumeIsolated {
				do {
					try MarklessScripting.shared.host.load(script)
				} catch {
					fatalError("Markless iOS host: \(error)")
				}
			}
		}
		CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .defaultMode)
	}

	/// Sends the request and answers on the main queue: the response with its body as text, or `{ error }` on any failure.
	func fetch(_ request: NativeFetchRequest, answer: @escaping (NativeFetchResponse) -> Void) {
		let token = nextAnswer
		nextAnswer += 1
		answers[token] = answer
		let session = self.session
		Task { @MainActor in
			let response = await Self.send(request, session)
			MarklessScripting.shared.answers.removeValue(forKey: token)?(response)
		}
	}

	private nonisolated static func send(_ request: NativeFetchRequest, _ session: URLSession) async -> NativeFetchResponse {
		guard let url = URL(string: request.url) else { return .error("Failed to parse URL from \(request.url)") }
		var asked = URLRequest(url: url)
		asked.httpMethod = request.method
		for header in request.headers { asked.addValue(header.value, forHTTPHeaderField: header.name) }
		asked.httpBody = request.body.map { Data($0.utf8) }
		do {
			let (data, response) = try await session.data(for: asked)
			guard let http = response as? HTTPURLResponse else { return .error("not an HTTP response") }
			let headers = http.allHeaderFields.compactMap { name, value -> NativeHeader? in
				guard let name = name as? String else { return nil }
				return NativeHeader(name: name.lowercased(), value: "\(value)")
			}.sorted { $0.name < $1.name }
			return .response(
				status: http.statusCode, statusText: reasonPhrases[http.statusCode] ?? "", headers: headers,
				body: String(decoding: data, as: UTF8.self))
		} catch {
			return .error(error.localizedDescription)
		}
	}

	/// 64 hex characters from the system's secure random source.
	nonisolated static func secureSeed() -> String {
		var bytes = [UInt8](repeating: 0, count: 32)
		guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
			fatalError("Markless iOS host: the system gave no secure random bytes")
		}
		return bytes.map { String(format: "%02x", $0) }.joined()
	}
}

/// `URLSession` does not keep the status line's text, so the standard reason phrase stands in for it.
private let reasonPhrases: [Int: String] = [
	200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 303: "See Other",
	304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized",
	403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Entity",
	429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
]
