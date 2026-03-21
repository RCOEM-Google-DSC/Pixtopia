"use client";

import React from "react";
import Image from "next/image";
import { Play } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

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

  const isGif = src.toLowerCase().endsWith(".gif") || src.includes("tenor.com");

  return (
    <div className={`relative group bg-black rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 aspect-video ${className}`}>
      {isGif ? (
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Using standard img instead of next/image for external GIFs to avoid ORB issues */}
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
          src={src}
          poster={poster}
          controls
          className="w-full h-full object-contain"
          autoPlay
          muted
          loop
        >
          Your browser does not support the video tag.
        </video>
      )}
      
      {/* Decorative Pixar-themed overlay */}
      <div className="absolute top-4 left-4 z-10">
        <div className="px-3 py-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-full">
          
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
