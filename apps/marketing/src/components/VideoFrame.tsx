import { useEffect, useRef } from "react";
import { cn } from "@avenire/ui/lib/utils";

type VideoFrameProps = {
  src: string;
  poster: string;
  alt: string;
  className?: string;
};

/**
 * A muted loop with no controls. It loads and plays only while on screen and pauses when
 * scrolled away. With reduced motion it stays on its poster.
 */
export default function VideoFrame({ src, poster, alt, className }: VideoFrameProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // React doesn't reflect `muted` from server HTML; browsers only autoplay muted video.
    video.muted = true;
    const observer = new IntersectionObserver(([entry]) => {
      // play() rejects when a pause interrupts it, which is expected here.
      if (entry?.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-label={alt}
      className={cn("size-full object-cover", className)}
    />
  );
}
