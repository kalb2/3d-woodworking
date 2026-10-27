import Foundation
import Capacitor
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Local Capacitor plugin: "Describe it" on Apple's on-device model (Foundation Models, iOS 26+).
/// The app sends the instructions and prompt; this only runs guided generation and returns JSON.
/// The app converts that JSON to its design spec and runs its own repair pass.
@objc(OnDeviceAIPlugin)
public class OnDeviceAIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OnDeviceAIPlugin"
    public let jsName = "OnDeviceAI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "boards", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selfTest", returnType: CAPPluginReturnPromise),
    ]

    /// { available, reason? }. reason: device_not_eligible, apple_intelligence_off, model_not_ready, os_too_old, unavailable.
    @objc func status(_ call: CAPPluginCall) {
        call.resolve(Self.statusInfo())
    }

    static func statusInfo() -> [String: Any] {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return ["available": true]
            case .unavailable(let reason):
                switch reason {
                case .deviceNotEligible: return ["available": false, "reason": "device_not_eligible"]
                case .appleIntelligenceNotEnabled: return ["available": false, "reason": "apple_intelligence_off"]
                case .modelNotReady: return ["available": false, "reason": "model_not_ready"]
                @unknown default: return ["available": false, "reason": "unavailable"]
                }
            @unknown default:
                return ["available": false, "reason": "unavailable"]
            }
        }
        #endif
        return ["available": false, "reason": "os_too_old"]
    }

    /// Debug builds only: true when launched with WB_AI_SELFTEST=1 (devicectl --environment-variables).
    @objc func selfTest(_ call: CAPPluginCall) {
        #if DEBUG
        call.resolve(["requested": ProcessInfo.processInfo.environment["WB_AI_SELFTEST"] == "1"])
        #else
        call.resolve(["requested": false])
        #endif
    }

    @objc func plan(_ call: CAPPluginCall) { generate(call, boards: false) }
    @objc func boards(_ call: CAPPluginCall) { generate(call, boards: true) }

    private func generate(_ call: CAPPluginCall, boards: Bool) {
        let instructions = call.getString("instructions") ?? ""
        let prompt = call.getString("prompt") ?? ""
        let maxTokens = call.getInt("maxTokens") ?? (boards ? 1800 : 300)
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let json = try await OnDeviceDesigner.run(instructions: instructions, prompt: prompt, boards: boards, maxTokens: maxTokens)
                    call.resolve(["json": json])
                } catch {
                    let (code, message) = OnDeviceDesigner.describe(error)
                    call.reject(message, code)
                }
            }
            return
        }
        #endif
        call.reject("Apple Intelligence needs iOS 26 or later.", "unavailable")
    }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
enum OnDeviceDesigner {
    static func run(instructions: String, prompt: String, boards: Bool, maxTokens: Int) async throws -> String {
        guard case .available = SystemLanguageModel.default.availability else {
            throw NSError(domain: "OnDeviceAI", code: 1, userInfo: [NSLocalizedDescriptionKey: "unavailable"])
        }
        let session = LanguageModelSession(instructions: instructions)
        let options = GenerationOptions(temperature: 0.2, maximumResponseTokens: maxTokens)
        if boards {
            return try await session.respond(to: prompt, generating: WBBoards.self, options: options).rawContent.jsonString
        }
        return try await session.respond(to: prompt, generating: WBPlan.self, options: options).rawContent.jsonString
    }

    /// (code, message) for the app. Codes: unavailable, context, guardrail, locale, busy, bad_json, refused, failed.
    static func describe(_ error: Error) -> (String, String) {
        if let e = error as? LanguageModelSession.GenerationError {
            switch e {
            case .exceededContextWindowSize: return ("context", "That's too much for the on-device model.")
            case .assetsUnavailable: return ("unavailable", "The on-device model isn't ready yet.")
            case .guardrailViolation: return ("guardrail", "The on-device model declined that request.")
            case .unsupportedLanguageOrLocale: return ("locale", "The on-device model doesn't support this language.")
            case .rateLimited, .concurrentRequests: return ("busy", "The on-device model is busy.")
            case .decodingFailure: return ("bad_json", "The on-device model's answer couldn't be read.")
            case .refusal: return ("refused", "The on-device model declined that request.")
            case .unsupportedGuide: return ("failed", "The on-device model couldn't follow the design format.")
            @unknown default: break
            }
        }
        if #available(iOS 27.0, *), let e = error as? LanguageModelError {
            switch e {
            case .contextSizeExceeded: return ("context", "That's too much for the on-device model.")
            case .guardrailViolation, .refusal: return ("guardrail", "The on-device model declined that request.")
            case .unsupportedLanguageOrLocale: return ("locale", "The on-device model doesn't support this language.")
            case .rateLimited: return ("busy", "The on-device model is busy.")
            case .timeout: return ("timeout", "The on-device model took too long.")
            default: break
            }
        }
        let text = (error as NSError).localizedDescription
        if text == "unavailable" { return ("unavailable", "Apple Intelligence isn't available.") }
        return ("failed", "The on-device model failed: \(text)")
    }
}

// Guided-generation shapes. They mirror the app's spec, kept small for the on-device
// context: sentinels (0, -1, "default") instead of optionals, a named turn instead of
// a rotation, and a cap on boards and joints. The app maps them to its spec.

@available(iOS 26.0, *)
@Generable(description: "A furniture plan: a template with parameters, or boards")
struct WBPlan {
    @Guide(description: "template when one of the templates fits, otherwise boards", .anyOf(["template", "boards"]))
    var kind: String
    @Guide(description: "Short name, like Bookshelf")
    var name: String
    @Guide(description: "The template (any value when kind is boards)", .anyOf(["bookshelf", "base-cabinet", "upper-cabinet", "window-bench"]))
    var template: String
    var params: WBParams
}

@available(iOS 26.0, *)
@Generable
struct WBParams {
    @Guide(description: "Width in inches, 0 if not given")
    var width: Double
    @Guide(description: "Height in inches, 0 if not given")
    var height: Double
    @Guide(description: "Depth in inches, 0 if not given")
    var depth: Double
    @Guide(description: "Shelves, -1 if not given", .range(-1...12))
    var shelves: Int
    @Guide(description: "Doors, -1 if not given", .range(-1...2))
    var doors: Int
    @Guide(description: "Drawers, -1 if not given", .range(-1...4))
    var drawers: Int
    @Guide(description: "Window bench cubbies, -1 if not given", .range(-1...8))
    var sections: Int
    @Guide(.anyOf(["default", "plywood", "birch", "oak", "walnut", "cherry", "mdf"]))
    var material: String
}

@available(iOS 26.0, *)
@Generable(description: "A piece made of boards")
struct WBBoards {
    @Guide(description: "Short name")
    var name: String
    @Guide(description: "Every board", .maximumCount(24))
    var boards: [WBBoard]
    @Guide(description: "Joints between touching boards, by board index", .maximumCount(36))
    var joints: [WBJoint]
}

@available(iOS 26.0, *)
@Generable
struct WBBoard {
    var name: String
    @Guide(.anyOf(["1x2", "2x2", "2x4", "2x6", "sheet"]))
    var stock: String
    @Guide(description: "Length in inches")
    var length: Double
    @Guide(description: "Sheet width in inches, 0 for lumber")
    var width: Double
    @Guide(description: "Sheet thickness 0.25, 0.5 or 0.75, 0 for lumber")
    var thickness: Double
    @Guide(description: "Left edge x, inches")
    var x: Double
    @Guide(description: "Bottom y, inches (floor is 0)")
    var y: Double
    @Guide(description: "Back z, inches")
    var z: Double
    @Guide(description: "flat, upright, edge or deep", .anyOf(["flat", "upright", "edge", "deep"]))
    var turn: String
}

@available(iOS 26.0, *)
@Generable
struct WBJoint {
    @Guide(.anyOf(["butt", "dado", "rabbet", "pocket", "dowel"]))
    var type: String
    var a: Int
    var b: Int
}
#endif
