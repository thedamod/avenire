import { useIsFocused } from "@react-navigation/native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView, type VideoThumbnail } from "expo-video";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { colors } from "../../../theme/tokens";
import { ErrorState, Icon, Pressable, Text } from "../../../ui";
import { formatTimestamp } from "./citations";
import { useAssetSource } from "../../../lib/useAssetSource";
import { Skeleton } from "../../../ui/Skeleton";

export function VideoTile({ url, title, durationSec, compact = false }: { url: string; title: string; durationSec: number | null; compact?: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const asset = useAssetSource(url, attempt);
  const retry = () => setAttempt((value) => value + 1);
  if (!asset) return <Skeleton height={compact ? 128 : 201} />;
  if (!asset.source) return <ErrorState message={asset.error ?? "This video couldn't load."} onRetry={retry} />;
  return <AuthenticatedVideo key={`${url}:${attempt}`} source={asset.source} title={title} durationSec={durationSec} compact={compact} retry={retry} />;
}

function AuthenticatedVideo({ source, title, durationSec, compact, retry }: { source: { uri: string; headers: Record<string, string> }; title: string; durationSec: number | null; compact: boolean; retry: () => void }) {
  const player = useVideoPlayer(source);
  const [playing, setPlaying] = useState(false);
  const [thumbnail, setThumbnail] = useState<VideoThumbnail>();
  const [duration, setDuration] = useState(durationSec);
  const [error, setError] = useState<string>();
  const focused = useIsFocused();
  useEffect(() => {
    let live = true;
    const loaded = () => {
      setDuration(player.duration || durationSec);
      if (Platform.OS !== "web") void player.generateThumbnailsAsync(0).then((frames) => { if (live) setThumbnail(frames[0]); }).catch(() => { /* The paused VideoView remains the poster when a codec cannot provide thumbnails. */ });
    };
    const listener = player.addListener("statusChange", (event) => {
      if (event.status === "readyToPlay") loaded();
      if (event.status === "error") setError(event.error?.message ?? "This video couldn't load.");
    });
    if (player.status === "readyToPlay") loaded();
    return () => { live = false; listener.remove(); };
  }, [player, durationSec]);
  useEffect(() => { if (!focused) { player.pause(); setPlaying(false); } }, [focused, player]);
  if (error) return <ErrorState message={error} onRetry={retry} />;
  return <View style={{ minWidth: 0, flex: compact ? 1 : undefined, gap: 6 }}>
    <View style={{ height: compact ? 128 : 201, borderRadius: 8, borderWidth: 1, borderColor: colors["line-2"], overflow: "hidden", backgroundColor: "#141418" }}>
      {thumbnail && !playing ? <Image source={thumbnail} accessibilityLabel={title} contentFit="cover" style={{ flex: 1 }} /> : <VideoView player={player} accessibilityLabel={title} nativeControls={playing} contentFit="contain" style={{ flex: 1 }} />}
      {!playing ? <Pressable accessibilityRole="button" accessibilityLabel={`Play ${title}`} onPress={() => { setPlaying(true); player.play(); }} style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#000000A0", alignItems: "center", justifyContent: "center" }}><Icon name="play" size={14} color="#FFFFFF" /></View>
      </Pressable> : null}
      {!playing && duration !== null ? <Text variant="mono" color="#FFFFFF" style={{ position: "absolute", right: 6, bottom: 6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: "#000000CC", fontSize: 10 }}>{formatTimestamp(duration)}</Text> : null}
    </View>
    <Text variant="meta" color="fg-2" numberOfLines={1}>Animation · {title}{duration !== null ? ` · ${formatTimestamp(duration)}` : ""}</Text>
  </View>;
}
