// Native presentation companion. Only bounded declarative JSON crosses stdio.
#include <QGuiApplication>
#include <QQuickView>
#include <QQuickItem>
#include <QSGRendererInterface>
#include <QScreen>
#include <QCursor>
#include <QSurfaceFormat>
#include <QJsonDocument>
#include <QJSValue>
#include <QJsonObject>
#include <QJsonArray>
#include <QBuffer>
#include <QDateTime>
#include <QTimer>
#include <QPointer>
#include <QRegularExpression>
#include <QCommandLineParser>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <thread>
#ifdef Q_OS_WIN
#include <windows.h>
#else
#include <unistd.h>
#endif

namespace {
constexpr qsizetype MaxRequest = 1024 * 1024;
constexpr qsizetype MaxImage = 768 * 1024;
std::mutex outputMutex;
void output(const QJsonObject &value) {
    const auto bytes = QJsonDocument(value).toJson(QJsonDocument::Compact) + '\n';
    std::lock_guard lock(outputMutex);
    std::fwrite(bytes.constData(), 1, bytes.size(), stdout);
    std::fflush(stdout);
}
void reply(QJsonValue id, QJsonValue result) { output({{"id", id}, {"ok", true}, {"result", result}}); }
void fail(QJsonValue id, const QString &code, const QString &message) {
    output({{"id", id}, {"ok", false}, {"error", QJsonObject{{"code", code}, {"message", message}}}});
}
void require(bool valid, const char *message) { if (!valid) throw std::runtime_error(message); }
bool number(QJsonValue value, double min, double max) {
    return value.isDouble() && std::isfinite(value.toDouble()) && value.toDouble() >= min && value.toDouble() <= max;
}
bool hexColor(QJsonValue value, bool alpha = false) {
    static const QRegularExpression rgb("^#[0-9a-fA-F]{6}$");
    static const QRegularExpression rgba("^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$");
    return value.isString() && (alpha ? rgba : rgb).match(value.toString()).hasMatch();
}
QJsonArray annotations(QJsonValue value) {
    require(value.isArray() && value.toArray().size() <= 128, "Expected at most 128 annotations");
    QSet<QString> ids;
    for (auto entry : value.toArray()) {
        require(entry.isObject(), "Expected annotation object");
        const auto item = entry.toObject();
        const auto id = item["id"].toString();
        require(!id.isEmpty() && id.size() <= 100 && !ids.contains(id), "Invalid or duplicate annotation id");
        ids.insert(id);
        require(QStringList{"rect", "arrow", "label", "cursor"}.contains(item["kind"].toString()), "Invalid annotation kind");
        require(number(item["x"], 0, 1) && number(item["y"], 0, 1), "Invalid annotation position");
        for (const auto &key : {"width", "height"})
            require(!item.contains(key) || number(item[key], 0, 1), "Invalid annotation extent");
        require(item["x"].toDouble() + item["width"].toDouble() <= 1 &&
                item["y"].toDouble() + item["height"].toDouble() <= 1, "Annotation exceeds bounds");
        require(!item.contains("text") || (item["text"].isString() && item["text"].toString().size() <= 512), "Invalid annotation text");
        require(!item.contains("color") || hexColor(item["color"], true), "Invalid annotation color");
    }
    return value.toArray();
}
QJsonObject scene(QJsonValue value) {
    require(value.isObject(), "Expected scene object");
    auto s = value.toObject();
    require(s["title"].isString() && s["title"].toString().size() <= 100, "Invalid scene title");
    require(number(s["cameraDistance"], 200, 1500), "Invalid camera distance");
    require(s["objects"].isArray() && !s["objects"].toArray().isEmpty() && s["objects"].toArray().size() <= 32, "Expected 1..32 scene objects");
    QSet<QString> ids;
    for (auto entry : s["objects"].toArray()) {
        require(entry.isObject(), "Expected scene object");
        auto obj = entry.toObject();
        auto id = obj["id"].toString();
        require(!id.isEmpty() && id.size() <= 100 && !ids.contains(id), "Invalid or duplicate object id");
        ids.insert(id);
        require(QStringList{"cube", "sphere", "cylinder", "cone", "plane"}.contains(obj["shape"].toString()), "Invalid primitive");
        for (auto key : {"position", "rotation", "scale"}) {
            require(obj[key].isArray() && obj[key].toArray().size() == 3, "Expected transform triple");
            for (auto v : obj[key].toArray())
                require(number(v, QString(key) == "scale" ? .01 : -500, QString(key) == "scale" ? 20 : 500), "Invalid transform");
        }
        require(hexColor(obj["color"]), "Invalid primitive color");
    }
    return s;
}
}

class Engine final : public QObject {
    Q_OBJECT
public:
    explicit Engine(QRect bounds) : bounds(bounds) {
        selected = QGuiApplication::primaryScreen();
        require(selected, "No graphical screen available");
        init(overlay, "Overlay.qml", "Ruth annotations");
        init(visual, "Visual.qml", "Ruth visualization");
        visual.resize(320, 320);
        connect(&visual, &QQuickWindow::frameSwapped, this, [this] { ++visualFrames; });
        connect(visual.rootObject(), SIGNAL(dismissRequested()), this, SLOT(dismiss()));
        sync();
    }
    void handle(const QByteArray &line) {
        QJsonValue id(QJsonValue::Null);
        try {
            QJsonParseError error;
            const auto doc = QJsonDocument::fromJson(line, &error);
            require(error.error == QJsonParseError::NoError && doc.isObject(), "Expected JSON object");
            const auto request = doc.object();
            id = request.value("id");
            if (id.isUndefined()) id = QJsonValue::Null;
            require(id.isNull() || id.isString() || id.isDouble(), "Invalid request id");
            require(request["method"].isString(), "Expected method");
            require(!request.contains("params") || request["params"].isObject(), "Expected params object");
            const auto method = request["method"].toString();
            const auto params = request["params"].toObject();
            if (method == "get_cursor") {
                reply(id, cursorPosition(params.contains("screenId") ? select(params) : selected.data()));
                return;
            }
            if (method == "inspect") {}
            else if (method == "show") {
                selected = select(params);
                overlay.setScreen(selected);
                overlay.setGeometry(bounds.isNull() ? selected->geometry() : bounds);
                overlayWanted = true;
                if (!capturing) { overlay.show(); raiseSurface(overlay); }
            } else if (method == "hide") {
                overlayWanted = visualWanted = false;
                overlay.hide(); visual.hide();
            } else if (method == "set_state") {
                require(QStringList{"idle", "thinking", "error"}.contains(params["phase"].toString()), "Invalid phase");
                require(!params.contains("reducedMotion") || params["reducedMotion"].isBool(), "Invalid reducedMotion");
                phase = params["phase"].toString(); reduced = params["reducedMotion"].toBool(); sync();
            } else if (method == "annotate") { items = annotations(params["items"]); sync(); }
            else if (method == "clear") { items = {}; sync(); }
            else if (method == "visualize") {
                require(params["visible"].isBool() && (!params.contains("interactive") || params["interactive"].isBool()), "Invalid visualization options");
                require(!(params.contains("scene") && params.contains("diagram")), "Choose one presentation type");
                if (params.contains("diagram")) {
                    const auto d = params["diagram"].toObject();
                    require(params["diagram"].isObject() && d["kind"] == "cart-pole", "Invalid diagram kind");
                    require(d["title"].isString() && d["title"].toString().size() <= 100, "Invalid diagram title");
                    require(number(d["angleDegrees"], -75, 75) && number(d["cartPosition"], -1, 1) && number(d["poleLength"], .5, 3), "Invalid diagram geometry");
                    require(d["showForce"].isBool() && QStringList{"light", "dark"}.contains(d["theme"].toString()), "Invalid diagram options");
                    visual.rootObject()->setProperty("diagram", d.toVariantMap());
                    visual.rootObject()->setProperty("sceneTitle", d["title"].toString());
                    visual.rootObject()->setProperty("mode", "cart-pole");
                    visual.resize(480, 340);
                }
                if (params.contains("scene")) {
                    const auto s = scene(params["scene"]);
                    visual.rootObject()->setProperty("mode", "3d");
                    visual.resize(320, 320);
                    visual.rootObject()->setProperty("objects", s["objects"].toArray().toVariantList());
                    visual.rootObject()->setProperty("sceneTitle", s["title"].toString());
                    visual.rootObject()->setProperty("cameraDistance", s["cameraDistance"].toDouble());
                }
                visual.rootObject()->setProperty("interactionEnabled", params["interactive"].toBool());
                visual.setFlags(flags(!params["interactive"].toBool()));
                visualWanted = params["visible"].toBool();
                require(selected, "Selected display disconnected");
                const auto area = bounds.isNull() ? selected->availableGeometry() : bounds;
                visual.setScreen(selected);
                visual.setPosition(area.right() - visual.width() - 20, area.bottom() - visual.height() - 20);
                visual.setVisible(visualWanted && !capturing);
                if (visual.isVisible()) raiseSurface(visual);
            } else if (method == "capture") {
                auto screen = select(params);
                if (capturing) { fail(id, "BUSY", "Capture already in progress"); return; }
                capturing = true;
                overlay.hide(); visual.hide();
                // Let the compositor retire both surfaces before sampling.
                QTimer::singleShot(150, this, [this, id, screen = QPointer<QScreen>(screen)] { capture(id, screen); });
                return;
            } else if (method == "shutdown") {
                reply(id, QJsonObject{});
                QTimer::singleShot(0, qApp, &QCoreApplication::quit);
                return;
            } else { fail(id, "METHOD_NOT_FOUND", "Unknown method"); return; }
            reply(id, state());
        } catch (const std::exception &error) { fail(id, "INVALID_REQUEST", QString::fromUtf8(error.what())); }
    }
private slots:
    void dismiss() {
        overlayWanted = visualWanted = false; overlay.hide(); visual.hide();
        output({{"event", "dismiss"}});
    }
private:
    QQuickView overlay, visual;
    QPointer<QScreen> selected;
    QRect bounds;
    QString phase = "idle";
    QJsonArray items;
    bool reduced = false, capturing = false, overlayWanted = false, visualWanted = false;
    quint64 visualFrames = 0;
    static Qt::WindowFlags flags(bool passive) {
        auto flags = Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint | Qt::Tool;
        if (passive) {
            flags |= Qt::WindowTransparentForInput | Qt::WindowDoesNotAcceptFocus;
            if (QGuiApplication::platformName() == "xcb") flags |= Qt::X11BypassWindowManagerHint;
        }
        return flags;
    }
    static void raiseSurface(QQuickView &view) {
        view.raise();
#ifdef Q_OS_WIN
        const auto pin = [&view] {
            if (view.isVisible())
                SetWindowPos(reinterpret_cast<HWND>(view.winId()), HWND_TOPMOST, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        };
        pin();
        // DWM/Qt can finish mapping after show() returns. Repeat once after that
        // transition; visibility guards prevent a queued hide/capture resurrecting it.
        QTimer::singleShot(50, &view, pin);
#endif
    }
    static void init(QQuickView &view, const QString &file, const QString &title) {
        view.setColor(Qt::transparent); view.setFlags(flags(true)); view.setTitle(title);
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/avenire/AvenireOverlay/" + file));
        require(view.status() != QQuickView::Error && view.rootObject(), "Embedded QML failed to load");
    }
    static QScreen *select(const QJsonObject &params) {
        if (!params.contains("screenId")) {
            auto screen = QGuiApplication::primaryScreen();
            require(screen, "No graphical screen available"); return screen;
        }
        require(params["screenId"].isString(), "Invalid screenId");
        for (auto screen : QGuiApplication::screens())
            if (screen->name() == params["screenId"].toString()) return screen;
        throw std::runtime_error("Unknown screenId");
    }
    QJsonObject cursorPosition(QScreen *screen) const {
        require(screen, "Selected display disconnected");
        const auto point = QCursor::pos();
        const auto area = bounds.isNull() ? screen->geometry() : bounds;
        const bool inside = area.contains(point);
        QJsonObject result{{"globalX", point.x()}, {"globalY", point.y()}, {"screenId", screen->name()},
            {"inBounds", inside}, {"observedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}};
        if (inside) {
            result.insert("x", double(point.x() - area.x()) / area.width());
            result.insert("y", double(point.y() - area.y()) / area.height());
        }
        return result;
    }
    void sync() {
        overlay.rootObject()->setProperty("phase", phase);
        overlay.rootObject()->setProperty("reducedMotion", reduced);
        overlay.rootObject()->setProperty("annotations", items.toVariantList());
    }
    QJsonObject state() {
        QJsonArray screens;
        for (auto s : QGuiApplication::screens()) {
            auto r = s->geometry();
            screens.append(QJsonObject{{"id", s->name()}, {"x", r.x()}, {"y", r.y()}, {"width", r.width()}, {"height", r.height()}, {"devicePixelRatio", s->devicePixelRatio()}});
        }
        const auto api = overlay.rendererInterface()->graphicsApi();
        QString apiName;
        switch (api) {
        case QSGRendererInterface::Software: apiName = "Software"; break;
        case QSGRendererInterface::OpenGL: apiName = "OpenGL"; break;
        case QSGRendererInterface::Direct3D11: apiName = "Direct3D11"; break;
        case QSGRendererInterface::Direct3D12: apiName = "Direct3D12"; break;
        case QSGRendererInterface::Vulkan: apiName = "Vulkan"; break;
        case QSGRendererInterface::Metal: apiName = "Metal"; break;
        default: apiName = "Unknown";
        }
        auto root = visual.rootObject();
        auto rawDiagram = root->property("diagram");
        if (rawDiagram.metaType() == QMetaType::fromType<QJSValue>()) rawDiagram = rawDiagram.value<QJSValue>().toVariant();
        auto diagram = QJsonObject::fromVariantMap(rawDiagram.toMap());
        diagram.insert("angleDegrees", root->property("diagramAngleDegrees").toDouble());
        diagram.insert("cartPosition", root->property("diagramCartPosition").toDouble());
        const auto bubbleLayout = overlay.rootObject()->property("bubbleGeometry").value<QJSValue>().toVariant();
        return {{"visible", overlay.isVisible()}, {"screenId", selected ? selected->name() : QString()},
            {"phase", phase}, {"reducedMotion", reduced}, {"items", items}, {"capturing", capturing},
            {"thinkingAnimationRunning", overlay.rootObject()->property("thinkingAnimationRunning").toBool()},
            {"visualizationVisible", visual.isVisible()}, {"visualizationInteractive", !visual.flags().testFlag(Qt::WindowTransparentForInput)},
            {"rotation", QJsonObject{{"x", root->property("rx").toDouble()}, {"y", root->property("ry").toDouble()}}},
            {"visualizationMode", root->property("mode").toString()},
            {"diagram", diagram}, {"annotationBubbles", QJsonValue::fromVariant(bubbleLayout)},
            {"sceneTitle", root->property("sceneTitle").toString()}, {"visualFrames", static_cast<double>(visualFrames)},
            {"windowIds", QJsonObject{{"overlay", static_cast<double>(overlay.winId())}, {"visualization", static_cast<double>(visual.winId())}}},
            {"screens", screens}, {"graphicsApi", apiName}, {"softwareRendering", api == QSGRendererInterface::Software}, {"hardwareAcceleration", "unverified"},
            {"flags", QJsonObject{{"alwaysOnTop", overlay.flags().testFlag(Qt::WindowStaysOnTopHint)}, {"transparentForInput", overlay.flags().testFlag(Qt::WindowTransparentForInput)}, {"doesNotAcceptFocus", overlay.flags().testFlag(Qt::WindowDoesNotAcceptFocus)}}}};
    }
    void capture(QJsonValue id, QPointer<QScreen> screen) {
        try {
            require(screen, "Selected display disconnected");
            const auto cursor = cursorPosition(screen);
            auto pixmap = bounds.isNull() ? screen->grabWindow(0) : screen->grabWindow(0,
                bounds.x() - screen->geometry().x(), bounds.y() - screen->geometry().y(), bounds.width(), bounds.height());
            require(!pixmap.isNull(), "Screen capture unavailable");
            const int sourceWidth = pixmap.width(), sourceHeight = pixmap.height();
            if (pixmap.width() > 1280 || pixmap.height() > 1280) pixmap = pixmap.scaled(1280, 1280, Qt::KeepAspectRatio, Qt::SmoothTransformation);
            QByteArray data;
            for (int attempt = 0; attempt < 8; ++attempt) {
                data.clear(); QBuffer buffer(&data); buffer.open(QIODevice::WriteOnly);
                require(pixmap.save(&buffer, "PNG"), "PNG encoding failed");
                if (data.size() <= MaxImage) break;
                pixmap = pixmap.scaled(qMax(1, int(pixmap.width() * .8)), qMax(1, int(pixmap.height() * .8)), Qt::KeepAspectRatio, Qt::SmoothTransformation);
            }
            require(data.size() <= MaxImage, "Screen image exceeds payload budget");
            reply(id, QJsonObject{{"mimeType", "image/png"}, {"data", QString::fromLatin1(data.toBase64())},
                {"width", pixmap.width()}, {"height", pixmap.height()}, {"sourceWidth", sourceWidth}, {"sourceHeight", sourceHeight},
                {"screenId", screen->name()}, {"capturedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}, {"cursor", cursor}});
        } catch (const std::exception &e) { fail(id, "CAPTURE_FAILED", QString::fromUtf8(e.what())); }
        capturing = false;
        overlay.setVisible(overlayWanted); visual.setVisible(visualWanted);
        if (overlayWanted) raiseSurface(overlay);
        if (visualWanted) raiseSurface(visual);
    }
};

int main(int argc, char **argv) {
    // A companion startup error belongs on the private diagnostics pipe, not in
    // a modal Qt dialog on the user's desktop (including missing plugins).
    qInstallMessageHandler([](QtMsgType, const QMessageLogContext &context, const QString &message) {
        const auto bytes = message.toUtf8();
        std::fprintf(stderr, "%s\n", bytes.constData());
        std::fflush(stderr);
#ifdef Q_OS_WIN
        // Qt calls MessageBox directly after a failed QPA load when the parent
        // has no console. Refuse at that startup warning instead, before Qt can
        // block the companion on a user-facing dialog. No GUI state exists yet.
        if (QString::fromLatin1(context.category) == "qt.qpa.plugin" &&
            message.startsWith("Could not") && message.contains("Qt platform plugin"))
            std::_Exit(EXIT_FAILURE);
#else
        Q_UNUSED(context);
#endif
    });
    QQuickWindow::setDefaultAlphaBuffer(true);
    auto format = QSurfaceFormat::defaultFormat(); format.setAlphaBufferSize(8); QSurfaceFormat::setDefaultFormat(format);
    QGuiApplication app(argc, argv); app.setQuitOnLastWindowClosed(false);
    QCommandLineParser parser; parser.addHelpOption();
    QCommandLineOption geometry({"geometry", "test-geometry"}, "Confine surfaces and capture to x,y,width,height", "rectangle");
    parser.addOption(geometry); parser.process(app);
    QRect bounds;
    if (parser.isSet(geometry)) {
        const auto parts = parser.value(geometry).split(',');
        bool valid = parts.size() == 4;
        QList<int> values;
        for (const auto &part : parts) { bool ok; values.append(part.toInt(&ok)); valid = valid && ok; }
        if (!valid || values[2] < 400 || values[3] < 400) parser.showHelp(2);
        bounds = QRect(values[0], values[1], values[2], values[3]);
    }
    try {
        Engine engine(bounds);
        // The raw reader never touches GUI objects. Bound both frames and queued work.
        struct ReaderState { std::atomic_bool running{true}; std::atomic_int queued{0}; };
        auto state = std::make_shared<ReaderState>();
        QObject::connect(&app, &QCoreApplication::aboutToQuit, &engine, [state] { state->running = false; });
        std::thread([state, target = QPointer<Engine>(&engine)] {
            QByteArray pending;
            bool oversized = false;
            char chunk[65536];
            while (state->running) {
#ifdef Q_OS_WIN
                DWORD count = 0;
                if (!ReadFile(GetStdHandle(STD_INPUT_HANDLE), chunk, sizeof(chunk), &count, nullptr) || !count) break;
#else
                const auto count = ::read(STDIN_FILENO, chunk, sizeof(chunk));
                if (count < 0 && errno == EINTR) continue;
                if (count <= 0) break;
#endif
                for (qsizetype i = 0; i < static_cast<qsizetype>(count); ++i) {
                    if (chunk[i] == '\n') {
                        if (oversized) fail(QJsonValue::Null, "INVALID_REQUEST", "Request exceeds 1 MiB");
                        else if (state->queued.fetch_add(1) >= 32) {
                            --state->queued;
                            fail(QJsonValue::Null, "BUSY", "Request queue is full");
                        } else {
                            const auto line = pending;
                            QMetaObject::invokeMethod(qApp, [state, target, line] {
                                --state->queued;
                                if (state->running && target) target->handle(line);
                            }, Qt::QueuedConnection);
                        }
                        pending.clear(); oversized = false;
                    } else if (!oversized) {
                        pending.append(chunk[i]);
                        if (pending.size() > MaxRequest) { pending.clear(); oversized = true; }
                    }
                }
            }
            if (state->running) QMetaObject::invokeMethod(qApp, &QCoreApplication::quit, Qt::QueuedConnection);
        }).detach();
        return app.exec();
    } catch (const std::exception &e) {
        std::fprintf(stderr, "Native overlay startup failed: %s\n", e.what()); return 1;
    }
}
#include "main.moc"
