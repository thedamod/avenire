import { SheetError as ErrorState } from "../outputs/SheetError";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { WebView } from "react-native-webview";
import { haptic, type HapticKind } from "../../../lib/haptics";
import { apiUrl } from "../../../state/auth";
import { colors, motion } from "../../../theme/tokens";
import { Button, Skeleton, Text } from "../../../ui";
import { clampRegion, type CitationTarget } from "./model";

export function CitedLabel({ children }: { children: string }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        minHeight: 24,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 5,
        backgroundColor: colors["accent-tint"],
        borderWidth: 1,
        borderColor: colors["accent-line"],
      }}
    >
      <Text color="accent-text" style={{ fontSize: 12, lineHeight: 16 }}>
        {children}
      </Text>
    </View>
  );
}

/** The PDF frame while anything is still loading (source, signed URL, WebView, PDF.js): fills the
 * sheet body like the finished viewer, with a fit-width page outline matching the web embed's
 * own placeholder so the handoff doesn't jump. Static and silent: no text, no animation. */
export function PdfLoadingFrame({ overlay = false }: { overlay?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel="Loading PDF"
      accessibilityState={{ busy: true }}
      pointerEvents="none"
      style={[
        overlay ? StyleSheet.absoluteFill : { flex: 1, minHeight: 220 },
        { overflow: "hidden", padding: 16, backgroundColor: colors["surface-3"] },
      ]}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
          aspectRatio: 1 / 1.294,
          backgroundColor: colors["surface-4"],
        }}
      />
    </View>
  );
}

const PREVIEW_PATH = "/source-preview/";
type PreviewMessage = { type?: unknown; message?: unknown; kind?: unknown };
/** The web host's touch feedback vocabulary; anything else from the page stays silent. */
const PREVIEW_HAPTICS = new Set<HapticKind>(["selection", "success", "error"]);

function parsePreviewMessage(data: string): PreviewMessage | undefined {
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as PreviewMessage)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The web's document-only PDF host (`/source-preview/<id>`), not an app route: no session,
 * no RPC, no app chrome. The signed byte URL rides in the fragment so it never reaches server
 * logs; `page` and `q` select the cited page and highlight the passage in PDF.js. */
export function pdfPreviewUrl(
  sourceId: string,
  page: number | undefined,
  contentUrl: string,
  passage?: string,
): string {
  const url = new URL(`${PREVIEW_PATH}${encodeURIComponent(sourceId)}`, apiUrl);
  url.searchParams.set("page", String(Math.max(1, page ?? 1)));
  if (passage) url.searchParams.set("q", passage);
  url.hash = new URLSearchParams({ url: new URL(contentUrl, apiUrl).toString() }).toString();
  return url.toString();
}

/** Only the preview document may load in the main frame. A redirect or in-page navigation
 * anywhere else (sign-in, Home, another source) is an error, never another app screen. */
function isPreviewDocument(value: string, expected: URL): boolean {
  try {
    const url = new URL(value);
    return url.origin === expected.origin && url.pathname === expected.pathname;
  } catch {
    return false;
  }
}

export function PdfSource({
  target,
  passage,
  contentUrl,
  onRetry,
}: {
  target: CitationTarget;
  passage?: string | undefined;
  contentUrl: string | undefined;
  /** Refetches the source so Retry gets a fresh signed URL when the old one is missing/expired. */
  onRetry?: (() => void) | undefined;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { sourceId, page } = target;
  const uri = useMemo(
    () => (contentUrl ? pdfPreviewUrl(sourceId, page, contentUrl, passage) : undefined),
    [sourceId, page, passage, contentUrl],
  );
  // A new document (fresh signed URL, page or passage) starts clean instead of inheriting the
  // previous one's error or loaded state.
  const [shown, setShown] = useState(uri);
  if (shown !== uri) {
    setShown(uri);
    setError(null);
    setLoaded(false);
  }
  const expected = useMemo(() => (uri ? new URL(uri) : undefined), [uri]);
  const source = useMemo(() => ({ uri: uri ?? "about:blank" }), [uri]);
  const fail = (message = "This PDF couldn't be opened.") => {
    setLoaded(true);
    setError(message);
  };
  if (!uri || !expected || error)
    return (
      <View style={{ padding: 20 }}>
        <ErrorState
          message={error ?? "This PDF couldn't be opened."}
          onRetry={() => {
            setError(null);
            setLoaded(false);
            setAttempt((value) => value + 1);
            onRetry?.();
          }}
        />
      </View>
    );
  return (
    <View style={{ flex: 1, minHeight: 220, backgroundColor: colors["surface-3"] }}>
      <WebView
        key={`${uri}:${attempt}`}
        source={source}
        accessibilityLabel={`PDF, page ${page ?? 1}`}
        style={{ flex: 1, backgroundColor: colors["surface-3"] }}
        javaScriptEnabled
        // Scroll and pinch stay inside the document (Android bottom sheets need nested scroll).
        nestedScrollEnabled
        overScrollMode="never"
        bounces={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        incognito
        originWhitelist={[expected.origin]}
        onShouldStartLoadWithRequest={(request) =>
          request.isTopFrame === false || isPreviewDocument(request.url, expected)
        }
        onNavigationStateChange={(state) => {
          if (state.url && !isPreviewDocument(state.url, expected)) fail();
        }}
        onMessage={(event) => {
          // Only the preview document speaks for this view; malformed or foreign messages are ignored.
          if (!isPreviewDocument(event.nativeEvent.url, expected)) return;
          const message = parsePreviewMessage(event.nativeEvent.data);
          if (!message) return;
          if (message.type === "avenire:haptic") {
            if (PREVIEW_HAPTICS.has(message.kind as HapticKind)) haptic(message.kind as HapticKind);
          } else if (message.type === "avenire:source-preview:ready") setLoaded(true);
          else if (message.type === "avenire:source-preview:error")
            fail(typeof message.message === "string" ? message.message : undefined);
        }}
        onLoadEnd={() => setLoaded(true)}
        onError={() => fail()}
        onHttpError={() => fail()}
      />
      {!loaded ? <PdfLoadingFrame overlay /> : null}
    </View>
  );
}

/** expo-video owns controls and releases the native player when this sheet unmounts. */
export function VideoSource({
  url,
  time,
  headers,
}: {
  url: string;
  time: number;
  headers?: Record<string, string> | undefined;
}) {
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fail = useCallback(() => setError(true), []);
  return error ? (
    <ErrorState
      message="This video couldn't be played."
      onRetry={() => {
        setError(false);
        setAttempt((value) => value + 1);
      }}
    />
  ) : (
    <NativeVideo key={`${url}:${attempt}`} url={url} time={time} headers={headers} onError={fail} />
  );
}
function NativeVideo({
  url,
  time,
  headers,
  onError,
}: {
  url: string;
  time: number;
  headers: Record<string, string> | undefined;
  onError: () => void;
}) {
  const [ready, setReady] = useState(false);
  const source = useMemo(() => ({ uri: url, ...(headers ? { headers } : {}) }), [url, headers]);
  const player = useVideoPlayer(source, (instance) => {
    instance.pause();
  });
  useEffect(() => {
    let sought = false;
    const seek = () => {
      if (sought) return;
      sought = true;
      player.currentTime = Math.max(
        0,
        Math.min(time, player.duration > 0 ? player.duration : time),
      );
      setReady(true);
    };
    const loaded = player.addListener("sourceLoad", seek);
    const status = player.addListener("statusChange", (event) => {
      if (event.status === "error") onError();
      else if (event.status === "readyToPlay") seek();
    });
    if (player.status === "readyToPlay") seek();
    return () => {
      loaded.remove();
      status.remove();
    };
  }, [player, time, onError]);
  return (
    <View
      style={{
        aspectRatio: 358 / 201,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: colors["surface-2"],
      }}
    >
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        nativeControls
        contentFit="contain"
        accessibilityLabel="Cited video, playback controls"
      />
      {!ready ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <Skeleton height={201} radius={10} />
        </View>
      ) : null}
    </View>
  );
}

export function YouTubeSource({ id, time }: { id: string; time: number }) {
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return error ? (
    <ErrorState
      message="This video couldn't be opened."
      onRetry={() => {
        setError(false);
        setAttempt((value) => value + 1);
      }}
    />
  ) : (
    <WebView
      key={attempt}
      accessibilityLabel="Cited YouTube video"
      source={{
        uri: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?start=${Math.floor(time)}&playsinline=1&autoplay=0`,
      }}
      style={{ aspectRatio: 358 / 201, borderRadius: 10, backgroundColor: colors["surface-2"] }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction
      onError={() => setError(true)}
      onHttpError={() => setError(true)}
    />
  );
}

const IMAGE_HEIGHT = 228;
const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.25;
const ZOOM_TIMING = {
  duration: motion.duration.normal,
  easing: Easing.bezier(...motion.easing.out),
  reduceMotion: ReduceMotion.System,
};

/** Where the cited region sits once focused: the zoom that frames it and the offset that centers
 * it, clamped so the image never slides past its own fitted edges. */
function regionFocus(box: ReturnType<typeof clampRegion>, width: number, height: number) {
  if (!box || !width || !height) return { scale: 1, x: 0, y: 0 };
  const scale = Math.max(1, Math.min(3, 0.78 / Math.max(box.width, box.height)));
  const limitX = (width * (scale - 1)) / 2;
  const limitY = (height * (scale - 1)) / 2;
  return {
    scale,
    x: Math.max(-limitX, Math.min(limitX, (0.5 - box.x - box.width / 2) * width * scale)),
    y: Math.max(-limitY, Math.min(limitY, (0.5 - box.y - box.height / 2) * height * scale)),
  };
}

/** Pinch, pan and double-tap on both platforms (ScrollView zoom is iOS-only). One-finger drags
 * only pan once zoomed in; at 1x they fail straight away so the sheet body scrolls, the sheet
 * drags and the back edge swipe all keep working. */
export function ImageSource({
  url,
  title,
  region,
}: {
  url: string;
  title: string;
  region: CitationTarget["region"];
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [intrinsic, setIntrinsic] = useState({ width: 358, height: IMAGE_HEIGHT });
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [focus, setFocus] = useState(true);
  const box = useMemo(() => clampRegion(region), [region]);
  const fittedWidth = Math.min(size.width, (size.height * intrinsic.width) / intrinsic.height);
  const fittedHeight = fittedWidth ? (fittedWidth * intrinsic.height) / intrinsic.width : 0;
  const focused = useMemo(
    () => regionFocus(focus ? box : undefined, fittedWidth, fittedHeight),
    [focus, box, fittedWidth, fittedHeight],
  );

  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0 });
  const origin = useSharedValue({ x: 0, y: 0 });
  const bounds = useSharedValue({ width: 0, height: 0 });

  useEffect(() => {
    bounds.value = { width: fittedWidth, height: fittedHeight };
  }, [bounds, fittedWidth, fittedHeight]);
  useEffect(() => {
    scale.value = withTiming(focused.scale, ZOOM_TIMING);
    x.value = withTiming(focused.x, ZOOM_TIMING);
    y.value = withTiming(focused.y, ZOOM_TIMING);
  }, [focused, scale, x, y]);

  const gesture = useMemo(() => {
    const clampX = (value: number, s: number) => {
      "worklet";
      const limit = (bounds.value.width * (s - 1)) / 2;
      return Math.max(-limit, Math.min(limit, value));
    };
    const clampY = (value: number, s: number) => {
      "worklet";
      const limit = (bounds.value.height * (s - 1)) / 2;
      return Math.max(-limit, Math.min(limit, value));
    };
    const settle = (s: number, tx: number, ty: number) => {
      "worklet";
      scale.value = withTiming(s, ZOOM_TIMING);
      x.value = withTiming(clampX(tx, s), ZOOM_TIMING);
      y.value = withTiming(clampY(ty, s), ZOOM_TIMING);
    };
    const begin = () => {
      "worklet";
      start.value = { scale: scale.value, x: x.value, y: y.value };
    };
    const pinch = Gesture.Pinch()
      .onStart(begin)
      .onUpdate((event) => {
        // Keep the point between the fingers fixed while scaling around the viewport center.
        const s = Math.max(1, Math.min(MAX_ZOOM, start.value.scale * event.scale));
        const fx = event.focalX - size.width / 2;
        const fy = event.focalY - size.height / 2;
        const ratio = s / start.value.scale;
        scale.value = s;
        x.value = clampX(fx - (fx - start.value.x) * ratio, s);
        y.value = clampY(fy - (fy - start.value.y) * ratio, s);
      })
      .onEnd(() => {
        if (scale.value < 1.02) settle(1, 0, 0);
      });
    const pan = Gesture.Pan()
      .manualActivation(true)
      .onStart((event) => {
        origin.value = { x: x.value - event.translationX, y: y.value - event.translationY };
      })
      .onTouchesMove((_event, state) => {
        if (scale.value > 1.01) state.activate();
        else state.fail();
      })
      .onUpdate((event) => {
        // While two fingers are down the pinch owns the offset; re-anchor so lifting one
        // finger continues the pan from where the pinch left it instead of jumping.
        if (event.numberOfPointers > 1) {
          origin.value = { x: x.value - event.translationX, y: y.value - event.translationY };
          return;
        }
        x.value = clampX(origin.value.x + event.translationX, scale.value);
        y.value = clampY(origin.value.y + event.translationY, scale.value);
      });
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .onEnd((event, success) => {
        if (!success) return;
        if (scale.value > 1.05) settle(1, 0, 0);
        else {
          const fx = event.x - size.width / 2;
          const fy = event.y - size.height / 2;
          settle(DOUBLE_TAP_ZOOM, fx * (1 - DOUBLE_TAP_ZOOM), fy * (1 - DOUBLE_TAP_ZOOM));
        }
      });
    return Gesture.Race(Gesture.Simultaneous(pinch, pan), doubleTap);
  }, [bounds, origin, scale, start, x, y, size.width, size.height]);

  const transform = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));
  const outline = useAnimatedStyle(() => ({ borderWidth: 1.5 / scale.value }));
  const label = useAnimatedStyle(() => ({ transform: [{ scale: 1 / scale.value }] }));

  if (error)
    return (
      <ErrorState
        message="This image couldn't be opened."
        onRetry={() => {
          setError(false);
          setLoaded(false);
          setAttempt((value) => value + 1);
        }}
      />
    );
  return (
    <View style={{ gap: 6 }}>
      <GestureHandlerRootView style={{ height: IMAGE_HEIGHT }}>
        <GestureDetector gesture={gesture}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={title}
            accessibilityHint="Pinch or double-tap to zoom"
            accessibilityActions={[{ name: "activate", label: "Toggle zoom" }]}
            onAccessibilityAction={() => {
              scale.value = withTiming(scale.value > 1.05 ? 1 : DOUBLE_TAP_ZOOM, ZOOM_TIMING);
              x.value = withTiming(0, ZOOM_TIMING);
              y.value = withTiming(0, ZOOM_TIMING);
            }}
            onLayout={(event) => setSize(event.nativeEvent.layout)}
            style={{
              height: IMAGE_HEIGHT,
              width: "100%",
              overflow: "hidden",
              borderRadius: 10,
              backgroundColor: "#1A1A1A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Animated.View
              style={[{ width: fittedWidth || "100%", height: fittedHeight || "100%" }, transform]}
            >
              <ExpoImage
                key={attempt}
                source={{ uri: url }}
                accessible={false}
                contentFit="contain"
                style={{ width: "100%", height: "100%" }}
                onLoad={(event) => {
                  setIntrinsic({ width: event.source.width, height: event.source.height });
                  setLoaded(true);
                }}
                onError={() => setError(true)}
              />
              {box && loaded ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: "absolute",
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                      borderColor: colors.accent,
                      backgroundColor: "#ABC4FF26",
                    },
                    outline,
                  ]}
                >
                  <Animated.Text
                    style={[
                      {
                        position: "absolute",
                        top: -16,
                        left: 0,
                        paddingHorizontal: 4,
                        fontSize: 10,
                        lineHeight: 14,
                        color: colors["on-accent"],
                        backgroundColor: colors.accent,
                        transformOrigin: "left bottom",
                      },
                      label,
                    ]}
                  >
                    cited
                  </Animated.Text>
                </Animated.View>
              ) : null}
            </Animated.View>
            {!loaded ? (
              <View style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
                <Skeleton height={IMAGE_HEIGHT} radius={10} />
              </View>
            ) : null}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
      {box ? (
        <Button
          variant="link"
          hitSlop={6}
          accessibilityLabel={focus ? "Show whole image" : "Focus cited image region"}
          onPress={() => setFocus(!focus)}
          style={{ alignSelf: "flex-end" }}
        >
          {focus ? "Show whole image" : "Focus cited region"}
        </Button>
      ) : null}
    </View>
  );
}
