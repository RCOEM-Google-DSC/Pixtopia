"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Image from "next/image";

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);
    return isMobile;
}

export default function Hero() {
    const [isVideoFinished, setIsVideoFinished] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const isMobile = useIsMobile();

    // Fallback in case the video metadata fails to load or video format isn't supported
    useEffect(() => {
        const fallbackTimer = setTimeout(() => {
            if (!isVideoFinished) {
                setIsVideoFinished(true);
            }
        }, 6000); // Trigger after 6 seconds as a fallback (clip is 3-5s)

        return () => clearTimeout(fallbackTimer);
    }, [isVideoFinished]);

    const handleVideoEnded = () => {
        setIsVideoFinished(true);
    };

    const handleVideoError = () => {
        setVideoError(true);
        setIsVideoFinished(true);
    };

    return (
        <div className="relative w-full min-h-screen bg-black text-white font-sans overflow-x-hidden">
      
            <div className="relative w-full h-[100vh] overflow-hidden">
           
                <div
                    className="absolute inset-0 w-full h-full bg-cover bg-center z-0 opacity-40"
                    style={{
                        backgroundImage: `url(/hero/bg.jpg)`,
                        mixBlendMode: "luminosity",
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black z-0" />

              
                <div
                    className="absolute rounded-full pointer-events-none z-0"
                    style={{
                        top: "-10%",
                        left: "-10%",
                        width: "50vw",
                        height: "50vw",
                        backgroundColor: "rgba(88, 28, 135, 0.4)",
                        mixBlendMode: "screen",
                        filter: "blur(120px)",
                        opacity: 0.6,
                    }}
                />
                <div
                    className="absolute rounded-full pointer-events-none z-0"
                    style={{
                        top: "20%",
                        right: "0%",
                        width: "40vw",
                        height: "40vw",
                        backgroundColor: "rgba(112, 26, 117, 0.3)",
                        mixBlendMode: "screen",
                        filter: "blur(150px)",
                        opacity: 0.5,
                    }}
                />
                <div
                    className="absolute rounded-full pointer-events-none z-0"
                    style={{
                        bottom: "-10%",
                        left: "20%",
                        width: "60vw",
                        height: "60vw",
                        backgroundColor: "rgba(76, 29, 149, 0.3)",
                        mixBlendMode: "screen",
                        filter: "blur(130px)",
                        opacity: 0.4,
                    }}
                />

                {/* Video Overlay Layer */}
                <AnimatePresence>
                    {!isVideoFinished && !videoError && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.5, ease: "easeInOut" }}
                            className={`absolute inset-0 z-10 flex items-center justify-center ${isMobile ? 'bg-black' : ''}`}
                            style={isMobile ? {} : { backgroundImage: 'url(/hero/bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
                        >
                            <div className="relative w-full h-full overflow-hidden">
                                <video
                                    ref={videoRef}
                                    className="w-full h-full object-contain sm:object-cover"
                                    autoPlay
                                    muted
                                    playsInline
                                    onEnded={handleVideoEnded}
                                    onError={(e) => {
                                        console.error("Video error:", e);
                                        handleVideoError();
                                    }}
                                >
                                    <source
                                        src="/hero/wall-e-user-clip.mp4"
                                        type="video/mp4"
                                    />
                                    Your browser does not support the video tag.
                                </video>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="relative z-20 w-full h-full flex flex-col items-center justify-center pointer-events-none">
                    <AnimatePresence>
                        {isVideoFinished && (
                            <motion.div
                                initial={{ opacity: 0, x: isMobile ? 60 : 250 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                    duration: isMobile ? 2.5 : 4.5,
                                    ease: [0.05, 0.9, 0.1, 1],
                                }}
                                className="flex flex-col items-center justify-center pointer-events-auto px-4 text-center w-full"
                                style={{ willChange: "transform, opacity" }}
                            >
                                {/* GDG Logo - right above the title */}
                                <div className="mb-4 sm:mb-6">
                                    <Image
                                        src="/hero/gdg-logo.svg"
                                        alt="GDG Logo"
                                        width={200}
                                        height={200}
                                        className="w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 lg:w-72 lg:h-72"
                                        style={{
                                            filter: "drop-shadow(0 0 20px rgba(255,255,255,0.5)) brightness(1.1)",
                                        }}
                                        priority
                                    />
                                </div>

                                {/* Glowing Hero Text */}
                                <motion.h1
                                    className="text-[4.5rem] sm:text-[7rem] md:text-[10rem] lg:text-[14rem] xl:text-[16rem] leading-none font-black tracking-[0.15em] text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500 text-center"
                                    style={{
                                        fontFamily: "var(--font-bebas)",
                                        textShadow:
                                            "0 0 50px rgba(255, 255, 255, 0.6), 0 0 100px rgba(255, 255, 255, 0.3), 0 0 150px rgba(100, 150, 255, 0.4)",
                                    }}
                                >
                                    PIXTOPIA
                                </motion.h1>

                                <motion.p
                                    initial={{ opacity: 0, y: 25 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                        duration: 3.0,
                                        delay: 1.5,
                                        ease: [0.05, 0.9, 0.1, 1],
                                    }}
                                    className="mt-2 sm:mt-4 text-sm sm:text-lg md:text-2xl text-slate-300 font-light tracking-[0.15em] sm:tracking-widest uppercase"
                                >
                                    A Cinematic Experience
                                </motion.p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
            {/* End of Hero Section */}
        </div>
    );
}
