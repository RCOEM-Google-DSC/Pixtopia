"use client";

import React from "react";
import { Play } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

/**
 * Renders video clips (mp4, webm) and animated images (gif) with proper
 * format detection. SSR-safe: renders the correct HTML element on the
 * server so hydration is instant without layout shift.
 */
const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  className = "",
}) => {
  if (!src) {
    return (
      <div className={`flex flex-col items-center justify-center bg-zinc-900 border-2 border-dashed border-zinc-800 rounded-3xl min-h-[300px] ${className}`}>
        <div className="p-4 bg-zinc-800/50 rounded-full mb-3">
          <Play className="w-8 h-8 text-zinc-600" />
        </div>
        <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Video not available</p>
      </div>
    );
  }

  const lowerSrc = src.toLowerCase();
  const isGif =
    lowerSrc.endsWith(".gif") ||
    src.includes("tenor.com") ||
    src.includes("giphy.com");
  const isWebm = lowerSrc.endsWith(".webm");

  // Determine MIME type for <source> tags
  const getMimeType = () => {
    if (isWebm) return "video/webm";
    if (lowerSrc.endsWith(".mp4")) return "video/mp4";
    if (lowerSrc.endsWith(".ogg") || lowerSrc.endsWith(".ogv")) return "video/ogg";
    return "video/mp4"; // fallback
  };

  return (
    <div className={`relative group bg-black rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 aspect-video ${className}`}>
      {isGif ? (
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Using standard img for external GIFs — Next.js Image doesn't support animated GIFs well */}
          <img
            src={src}
            alt="Challenge Clip"
            className="w-full h-full object-contain"
            loading="eager"
          />
        </div>
      ) : (
        <video
          data-testid="video-player"
          poster={poster}
          controls
          className="w-full h-full object-contain"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src={src} type={getMimeType()} />
          {/* Fallback: if webm, also try mp4 variant */}
          {isWebm && (
            <source src={src.replace(/\.webm$/i, ".mp4")} type="video/mp4" />
          )}
          Your browser does not support the video tag.
        </video>
      )}
    </div>
  );
};

export default VideoPlayer;
