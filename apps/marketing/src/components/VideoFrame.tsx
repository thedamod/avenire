import { useRef, useState } from "react";
import { cn } from "@avenire/ui/lib/utils";
import { PlayIcon } from "./Icons.tsx";

type VideoFrameProps = {
  src: string;
  poster: string;
  /** Accessible name for the play button. */
  label: string;
  alt: string;
  size?: "md" | "lg";
  className?: string;
};

/** A poster with a play button. The video only loads once someone presses play. */
export default function VideoFrame({
  src,
  poster,
  label,
  alt,
  size = "lg",
  className,
}: VideoFrameProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    setPlaying(true);
    void video.current?.play();
  };

  return (
    <div className={cn("relative size-full", className)}>
      <video
        ref={video}
        src={src}
        poster={poster}
        controls={playing}
        playsInline
        preload="none"
        aria-label={alt}
        className="size-full object-cover"
      />
      <button
        type="button"
        onClick={play}
        aria-label={label}
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-moderate ease-out",
          playing && "pointer-events-none opacity-0",
        )}
      >
        <span
          className={cn(
            "bg-primary text-primary-foreground flex items-center justify-center rounded-full transition-transform duration-normal ease-out hover:scale-105",
            size === "lg" ? "shadow-play size-18" : "size-14",
          )}
        >
          <PlayIcon className={cn("translate-x-px", size === "lg" ? "h-6 w-5.5" : "h-5 w-4.5")} />
        </span>
      </button>
    </div>
  );
}
