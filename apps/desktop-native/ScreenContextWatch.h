#pragma once
#include <QImage>
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
        timer.setInterval(500);
        connect(&timer, &QTimer::timeout, this, [this] { poll(); });
    }
    void arm(QScreen *screen, const QRect &area, const QPixmap &pixels) {
        source = screen; geometry = screen->geometry(); this->area = area;
        baseline = fingerprint(pixels); timer.start();
    }
    void disarm() { timer.stop(); baseline = {}; source = nullptr; }
private:
    QPointer<QScreen> source;
    QRect geometry, area;
    QImage baseline;
    QTimer timer;
    std::function<void()> invalidate;
    std::function<bool()> enabled;
    std::function<QImage(QSize)> exclusions;
    static QImage fingerprint(const QPixmap &pixels) {
        return pixels.toImage().scaled(160, 90, Qt::IgnoreAspectRatio, Qt::FastTransformation)
            .convertToFormat(QImage::Format_RGB32);
    }
    void changed() { disarm(); invalidate(); }
    void poll() {
        if (!enabled()) return;
        if (!source || source->geometry() != geometry) { changed(); return; }
        const auto pixels = source->grabWindow(0, area.x() - geometry.x(), area.y() - geometry.y(), area.width(), area.height());
        if (pixels.isNull()) { changed(); return; }
        const auto current = fingerprint(pixels);
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
        if (observed < 256 || differences >= qMax(8, observed / 300)) changed();
    }
};
