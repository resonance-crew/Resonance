import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

/// A picture from a conversation, full screen (round 7 §4.3): on a dark backdrop, fitted — the
/// thread's own size at once, then the picture as kept — pinched or double-tapped to zoom, swiped
/// down or closed (the close in its corner, the escape gesture) to go back to the thread. Nothing to
/// save or share yet. It fades in and out over the thread (at once under Reduce Motion).
struct ChatPictureViewer: View {
    let picture: ChatImage
    let store: ChatImageStore
    let onClose: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var image: UIImage?
    @State private var failed = false
    @State private var attempt = 0
    @State private var shown = false
    @State private var leaving = false
    /// How far the picture is pulled down (it goes past `ZoomingPictureView.dismissPull`).
    @State private var pull: CGFloat = 0

    var body: some View {
        ZStack(alignment: .topTrailing) {
            // Solid while the picture is looked at; the thread shows through as it is pulled away.
            Color.black
                .opacity(1 - min(pull / 500, 0.6))
                .ignoresSafeArea()
                .accessibilityHidden(true)
            ZStack {
                if let image {
                    ZoomingPicture(image: image, onPull: { pull = $0 }, onLetGo: { gone in
                        if gone { close() } else { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { pull = 0 } }
                    })
                    .offset(y: pull)
                    .accessibilityElement()
                    .accessibilityLabel(L10n.Messages.attachImage)
                    .accessibilityAddTraits(.isImage)
                } else if failed {
                    Button { attempt += 1 } label: {
                        OrganicIcon(.image, size: 30, color: Tokens.cream.opacity(0.7))
                            .frame(width: 88, height: 88)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.Native.retry)
                } else {
                    SketchLoader(size: 40, color: Tokens.cream)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .ignoresSafeArea()
            Button(action: close) {
                OrganicIcon(.close, size: 20, color: Tokens.cream)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(OrganicPressStyle(color: Tokens.cream.opacity(0.16)))
            .accessibilityLabel(L10n.Native.close)
            .padding(.trailing, 12)
            .padding(.top, 8)
            .opacity(pull > 0 ? 0 : 1)
        }
        .opacity(shown ? 1 : 0)
        .presentationBackground(.clear)
        .statusBarHidden()
        .accessibilityAction(.escape, close)
        .onEscapeKey(close)
        .onAppear { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { shown = true } }
        .task(id: attempt) { await load() }
    }

    /// The thread's size at once when it is at hand, then the picture as kept.
    private func load() async {
        failed = false
        if image == nil { image = store.cached(picture.id, .full) ?? store.cached(picture.id, .thumb) }
        if store.cached(picture.id, .full) != nil { return }
        if image == nil, let thumb = await store.image(picture.id, .thumb) { image = thumb }
        if let full = await store.image(picture.id, .full) {
            image = full
        } else if image == nil {
            failed = true
        }
    }

    private func close() {
        guard !leaving else { return }
        leaving = true
        guard !reduceMotion else { return onClose() }
        withAnimation(.easeOut(duration: 0.16)) { shown = false }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(160))
            onClose()
        }
    }
}

/// A picture fitted to its frame in a zooming scroll view: pinched up to 4× or double-tapped to 2.5×
/// (and back) where the finger is, kept centred while smaller than the frame; at its fitted size a
/// pull downward is told as it goes (`onPull`) and when it lets go (`onLetGo`: whether it was far or
/// fast enough to close).
private struct ZoomingPicture: UIViewRepresentable {
    let image: UIImage
    var onPull: (CGFloat) -> Void
    var onLetGo: (Bool) -> Void

    func makeUIView(context: Context) -> ZoomingPictureView { ZoomingPictureView() }

    func updateUIView(_ view: ZoomingPictureView, context: Context) {
        view.onPull = onPull
        view.onLetGo = onLetGo
        if view.image !== image { view.image = image }
    }
}

final class ZoomingPictureView: UIView, UIScrollViewDelegate, UIGestureRecognizerDelegate {
    /// How far a pull goes (or how fast) before letting go closes the picture.
    static let dismissPull: CGFloat = 120
    static let dismissSpeed: CGFloat = 900
    static let doubleTapScale: CGFloat = 2.5

    private let scroll = UIScrollView()
    private let imageView = UIImageView()
    private var laidOutFor: CGSize = .zero
    var onPull: ((CGFloat) -> Void)?
    var onLetGo: ((Bool) -> Void)?

    var image: UIImage? {
        didSet {
            let resized = oldValue.map { $0.size.width / max($0.size.height, 1) } != image.map { $0.size.width / max($0.size.height, 1) }
            imageView.image = image
            // The same picture, sharper (the full size after the thread's): the zoom stays where it is.
            if resized || oldValue == nil { fit() }
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        scroll.delegate = self
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 4
        scroll.showsHorizontalScrollIndicator = false
        scroll.showsVerticalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.decelerationRate = .fast
        scroll.backgroundColor = .clear
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        scroll.addSubview(imageView)
        addSubview(scroll)
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
        doubleTap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(doubleTap)
        let pull = UIPanGestureRecognizer(target: self, action: #selector(pulled(_:)))
        pull.delegate = self
        addGestureRecognizer(pull)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        scroll.frame = bounds
        if bounds.size != laidOutFor {
            laidOutFor = bounds.size
            fit()
        }
    }

    /// The picture at its fitted size, centred.
    private func fit() {
        scroll.zoomScale = 1
        guard let image, bounds.width > 0, bounds.height > 0, image.size.width > 0, image.size.height > 0 else { return }
        let scale = min(bounds.width / image.size.width, bounds.height / image.size.height)
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        imageView.frame = CGRect(origin: .zero, size: size)
        scroll.contentSize = size
        centre()
    }

    private func centre() {
        let size = imageView.frame.size
        let x = max(0, (bounds.width - size.width) / 2)
        let y = max(0, (bounds.height - size.height) / 2)
        scroll.contentInset = UIEdgeInsets(top: y, left: x, bottom: y, right: x)
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    func scrollViewDidZoom(_ scrollView: UIScrollView) { centre() }

    @objc private func doubleTapped(_ tap: UITapGestureRecognizer) {
        if scroll.zoomScale > scroll.minimumZoomScale + 0.01 {
            scroll.setZoomScale(scroll.minimumZoomScale, animated: true)
            return
        }
        let point = tap.location(in: imageView)
        let size = CGSize(width: scroll.bounds.width / Self.doubleTapScale, height: scroll.bounds.height / Self.doubleTapScale)
        scroll.zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height),
                    animated: true)
    }

    /// The pull to close: only at the fitted size, and only downward.
    override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
        guard let pan = gesture as? UIPanGestureRecognizer, pan.view === self else { return super.gestureRecognizerShouldBegin(gesture) }
        guard scroll.zoomScale <= scroll.minimumZoomScale + 0.01 else { return false }
        let speed = pan.velocity(in: self)
        return speed.y > abs(speed.x)
    }

    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }

    @objc private func pulled(_ pan: UIPanGestureRecognizer) {
        // In the window's space: the picture moves under the finger as it is pulled.
        let distance = max(0, pan.translation(in: nil).y)
        switch pan.state {
        case .changed:
            onPull?(distance)
        case .ended, .cancelled, .failed:
            let speed = pan.velocity(in: nil).y
            onLetGo?(pan.state == .ended && (distance > Self.dismissPull || speed > Self.dismissSpeed))
        default:
            break
        }
    }
}
