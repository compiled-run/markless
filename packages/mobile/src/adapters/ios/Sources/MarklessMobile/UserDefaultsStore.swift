#if canImport(UIKit)
import Foundation
import MarklessCore

/// Storage cells kept in `UserDefaults` as the value's own type (string, number or boolean); null removes the key.
public final class UserDefaultsStore: NativeStore {
	private let defaults: UserDefaults

	public init(_ defaults: UserDefaults = .standard) { self.defaults = defaults }

	public func read(_ key: String) -> NativeValue? {
		switch defaults.object(forKey: key) {
		case let text as String: return .string(text)
		case let number as NSNumber where CFGetTypeID(number) == CFBooleanGetTypeID(): return .bool(number.boolValue)
		case let number as NSNumber: return .number(number.doubleValue)
		default: return nil
		}
	}

	public func write(_ key: String, _ value: NativeValue) {
		// UserDefaults keeps the old object when the new one isEqual to it, and NSNumber 1 equals true.
		defaults.removeObject(forKey: key)
		switch value {
		case let .string(text): defaults.set(text, forKey: key)
		case let .number(number): defaults.set(number, forKey: key)
		case let .bool(flag): defaults.set(flag, forKey: key)
		case .null: break
		}
	}
}
#endif
