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
	private var sending: [Int: Task<Void, Never>] = [:]
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
					hostFailed("\(error)")
				}
			}
		}
		CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .defaultMode)
	}

	/// Sends the request and answers on the main queue: the response with its body as text, or `{ error }` on any failure.
	/// Returns the token `cancel(_:)` takes.
	@discardableResult
	func fetch(_ request: NativeFetchRequest, answer: @escaping (NativeFetchResponse) -> Void) -> Int {
		let token = nextAnswer
		nextAnswer += 1
		answers[token] = answer
		let session = self.session
		sending[token] = Task { @MainActor in
			let response = await Self.send(request, session)
			MarklessScripting.shared.sending[token] = nil
			MarklessScripting.shared.answers.removeValue(forKey: token)?(response)
		}
		return token
	}

	/// Stops a request `fetch` sent; its answer is never called.
	func cancel(_ token: Int) {
		answers[token] = nil
		sending.removeValue(forKey: token)?.cancel()
	}

	/// A FormData as a browser sends it: each entry a part, a file's with its filename, its type and its bytes, read from the
	/// file the picker chose (by its URL, the reference the host gave it) or from the text it was made of.
	private nonisolated static func multipart(_ parts: [NativeFormPart], boundary: String) throws -> Data {
		var body = Data()
		let quoted = { (text: String) in text.replacingOccurrences(of: "\"", with: "%22").replacingOccurrences(of: "\r", with: "%0D").replacingOccurrences(of: "\n", with: "%0A") }
		for part in parts {
			body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(quoted(part.name))\"".utf8))
			switch part.value {
			case let .text(text):
				body.append(Data("\r\n\r\n\(text)\r\n".utf8))
			case let .file(name, type, ref, text):
				body.append(Data("; filename=\"\(quoted(name))\"\r\nContent-Type: \(type.isEmpty ? "application/octet-stream" : type)\r\n\r\n".utf8))
				if let ref, let url = URL(string: ref) { body.append(try Data(contentsOf: url)) } else { body.append(Data((text ?? "").utf8)) }
				body.append(Data("\r\n".utf8))
			}
		}
		body.append(Data("--\(boundary)--\r\n".utf8))
		return body
	}

	private nonisolated static func send(_ request: NativeFetchRequest, _ session: URLSession) async -> NativeFetchResponse {
		guard let url = URL(string: request.url) else { return .error("Failed to parse URL from \(request.url)") }
		var asked = URLRequest(url: url)
		asked.httpMethod = request.method
		for header in request.headers { asked.addValue(header.value, forHTTPHeaderField: header.name) }
		switch request.body {
		case let .text(text)?: asked.httpBody = Data(text.utf8)
		case let .form(parts)?:
			let boundary = "MarklessBoundary\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
			do { asked.httpBody = try multipart(parts, boundary: boundary) } catch { return .error(error.localizedDescription) }
			if !request.headers.contains(where: { $0.name.lowercased() == "content-type" }) {
				asked.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
			}
		case nil: break
		}
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
			hostFailed("the system gave no secure random bytes")
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
