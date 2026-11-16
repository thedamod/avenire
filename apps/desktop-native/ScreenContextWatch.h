#pragma once
#include <QImage>
#include <QElapsedTimer>
#include <QPixmap>
#include <QPointer>
#include <QScreen>
#include <QTimer>
#include <functional>

// Shared by every Qt capture backend. Only a small local fingerprint is retained;
// sampled frames are never sent over stdio or saved. Stop sampling when inactive.
class ScreenContextWatch final : public QObject {
public:
    ScreenContextWatch(QObject *parent, std::function<void()> invalidate,
                       std::function<bool()> enabled, std::function<QImage(QSize)> exclusions)
        : QObject(parent), invalidate(std::move(invalidate)), enabled(std::move(enabled)),
          exclusions(std::move(exclusions)) {
        timer.setSingleShot(true);
        connect(&timer, &QTimer::timeout, this, [this] { poll(); });
    }
    void arm(QScreen *screen, const QRect &area, const QPixmap &pixels = {}) {
        source = screen; geometry = screen->geometry(); this->area = area;
        baseline = pixels.isNull() ? QImage{} : fingerprint(pixels);
        age.start(); polls = 0; resume();
    }
    void pause() { timer.stop(); }
    void resume() {
        if (source && enabled() && !timer.isActive()) timer.start(500);
    }
    void disarm() { pause(); baseline = {}; source = nullptr; age.invalidate(); }
private:
    QPointer<QScreen> source;
    QRect geometry, area;
    QImage baseline;
    QTimer timer;
    QElapsedTimer age;
    int polls = 0;
    std::function<void()> invalidate;
    std::function<bool()> enabled;
    std::function<QImage(QSize)> exclusions;
    static QImage fingerprint(const QPixmap &pixels) {
        // Scale the pixmap before CPU image conversion; grabWindow itself may still
        // allocate a full-resolution surface on the GUI thread on some backends.
        return pixels.scaled(160, 90, Qt::IgnoreAspectRatio, Qt::FastTransformation)
            .toImage().convertToFormat(QImage::Format_RGB32);
    }
    void changed() { disarm(); invalidate(); }
    void poll() {
        if (!enabled()) return;
        // Bound a snapshot's lifetime as well as its polling frequency. Expiration
        // is conservative: delayed annotations require a new explicit observation.
        if (!source || source->geometry() != geometry || !age.isValid() || age.elapsed() >= 60000) {
            changed(); return;
        }
        const auto pixels = source->grabWindow(0, area.x() - geometry.x(), area.y() - geometry.y(), area.width(), area.height());
        if (pixels.isNull()) { changed(); return; }
        const auto current = fingerprint(pixels);
        if (baseline.isNull()) {
            baseline = current;
            timer.start(500);
            return;
        }
        const auto mask = exclusions(current.size());
        int observed = 0, differences = 0;
        for (int y = 0; y < current.height(); ++y) {
            const auto a = reinterpret_cast<const QRgb *>(baseline.constScanLine(y));
            const auto b = reinterpret_cast<const QRgb *>(current.constScanLine(y));
            const auto ignored = reinterpret_cast<const QRgb *>(mask.constScanLine(y));
            for (int x = 0; x < current.width(); ++x) {
                if (qRed(ignored[x])) continue;
                ++observed;
                if (qAbs(qRed(a[x]) - qRed(b[x])) > 24 || qAbs(qGreen(a[x]) - qGreen(b[x])) > 24 ||
                    qAbs(qBlue(a[x]) - qBlue(b[x])) > 24) ++differences;
            }
        }
        if (observed < 256 || differences >= qMax(8, observed / 300)) { changed(); return; }
        // Sample quickly during initial response, then back off for static figures.
        timer.start(++polls < 8 ? 500 : 2000);
    }
};
