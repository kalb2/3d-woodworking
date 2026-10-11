import UIKit
import Capacitor
import simd
#if canImport(RoomPlan)
import RoomPlan
#endif

private let metersToInches: Float = 39.3700787

/// Local Capacitor plugin: LiDAR wall scan via Apple RoomPlan (iOS 16+).
@objc(WallScanPlugin)
public class WallScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WallScanPlugin"
    public let jsName = "WallScan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
    ]

    private var presented: UIViewController?

    @objc func isSupported(_ call: CAPPluginCall) {
        var supported = false
        #if canImport(RoomPlan)
        if #available(iOS 16.0, *) { supported = RoomCaptureSession.isSupported }
        #endif
        call.resolve(["supported": supported])
    }

    @objc func scan(_ call: CAPPluginCall) {
        #if canImport(RoomPlan)
        if #available(iOS 16.0, *), RoomCaptureSession.isSupported {
            DispatchQueue.main.async {
                guard let host = self.bridge?.viewController else { call.reject("No view controller"); return }
                let vc = WallScanViewController()
                vc.modalPresentationStyle = .fullScreen
                vc.onFinish = { [weak self] result in
                    vc.dismiss(animated: true)
                    self?.presented = nil
                    switch result {
                    case .success(let payload): call.resolve(payload)
                    case .failure(let err): call.reject(err.localizedDescription, err.code)
                    }
                }
                self.presented = vc
                host.present(vc, animated: true)
            }
            return
        }
        #endif
        call.unavailable("RoomPlan requires a LiDAR iPhone/iPad on iOS 16+")
    }
}

struct WallScanError: Error {
    let code: String
    let localizedDescription: String
}

#if canImport(RoomPlan)
@available(iOS 16.0, *)
final class WallScanViewController: UIViewController, RoomCaptureViewDelegate {
    var onFinish: ((Result<[String: Any], WallScanError>) -> Void)?
    private var captureView: RoomCaptureView!
    private var finished = false
    private let doneButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        captureView = RoomCaptureView(frame: view.bounds)
        captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        captureView.delegate = self
        view.addSubview(captureView)

        for (button, title) in [(cancelButton, "Cancel"), (doneButton, "Done")] {
            button.setTitle(title, for: .normal)
            button.titleLabel?.font = .boldSystemFont(ofSize: 17)
            button.setTitleColor(.white, for: .normal)
            button.backgroundColor = UIColor.black.withAlphaComponent(0.55)
            button.layer.cornerRadius = 18
            button.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
            button.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(button)
        }
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            cancelButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            cancelButton.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
            doneButton.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            doneButton.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
        ])
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    @objc private func cancelTapped() {
        captureView.captureSession.stop()
        finish(.failure(WallScanError(code: "CANCELLED", localizedDescription: "Scan cancelled")))
    }

    @objc private func doneTapped() {
        doneButton.isEnabled = false
        doneButton.setTitle("Processing…", for: .normal)
        captureView.captureSession.stop()
    }

    private func finish(_ result: Result<[String: Any], WallScanError>) {
        guard !finished else { return }
        finished = true
        onFinish?(result)
    }

    // MARK: RoomCaptureViewDelegate
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        if let error = error {
            finish(.failure(WallScanError(code: "SCAN_FAILED", localizedDescription: error.localizedDescription)))
            return false
        }
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        if let error = error {
            finish(.failure(WallScanError(code: "SCAN_FAILED", localizedDescription: error.localizedDescription)))
            return
        }
        finish(.success(WallScanProcessor.payload(for: processedResult)))
    }
}

@available(iOS 16.0, *)
enum WallScanProcessor {
    private static func r(_ v: Float) -> Double { (Double(v) * 10).rounded() / 10 }

    static func payload(for room: CapturedRoom) -> [String: Any] {
        let walls = room.walls
        let wallJSON: [[String: Any]] = walls.map { w in
            let t = w.transform
            return [
                "id": w.identifier.uuidString,
                "width": r(w.dimensions.x * metersToInches),
                "height": r(w.dimensions.y * metersToInches),
                // Column-major 4x4, translation in inches.
                "transform": [t.columns.0, t.columns.1, t.columns.2, t.columns.3].enumerated().flatMap { idx, c -> [Double] in
                    idx == 3 ? [r(c.x * metersToInches), r(c.y * metersToInches), r(c.z * metersToInches), 1]
                             : [Double(c.x), Double(c.y), Double(c.z), Double(c.w)]
                },
            ]
        }
        func openings(_ surfaces: [CapturedRoom.Surface], kind: String) -> [[String: Any]] {
            surfaces.compactMap { s in
                var parent: CapturedRoom.Surface?
                if #available(iOS 17.0, *), let pid = s.parentIdentifier {
                    parent = walls.first { $0.identifier == pid }
                }
                let center = simd_make_float3(s.transform.columns.3)
                if parent == nil {
                    parent = walls.min { score(center, $0) < score(center, $1) }
                }
                guard let wall = parent else { return nil }
                let local = simd_mul(wall.transform.inverse, simd_make_float4(center, 1))
                let ww = wall.dimensions.x, wh = wall.dimensions.y
                let ow = s.dimensions.x, oh = s.dimensions.y
                let offsetX = max(0, min(ww - ow, local.x + ww / 2 - ow / 2))
                let bottom = max(0, min(wh - oh, local.y + wh / 2 - oh / 2))
                return [
                    "id": s.identifier.uuidString,
                    "kind": kind,
                    "wallId": wall.identifier.uuidString,
                    "width": r(ow * metersToInches),
                    "height": r(oh * metersToInches),
                    "offsetX": r(offsetX * metersToInches),
                    "bottom": r(bottom * metersToInches),
                ]
            }
        }
        return [
            "walls": wallJSON,
            "windows": openings(room.windows, kind: "window"),
            "doors": openings(room.doors, kind: "door"),
            "openings": openings(room.openings, kind: "opening"),
        ]
    }

    /// Distance from a point to a wall's plane, penalized when outside its extent.
    private static func score(_ p: simd_float3, _ wall: CapturedRoom.Surface) -> Float {
        let local = simd_mul(wall.transform.inverse, simd_make_float4(p, 1))
        let outX = max(0, abs(local.x) - wall.dimensions.x / 2)
        let outY = max(0, abs(local.y) - wall.dimensions.y / 2)
        return abs(local.z) + outX + outY
    }
}
#endif
