"use client";

import { useEffect, useState } from "react";
import Desktop13 from "./homepage-data/Desktop13";
import Footer from "@/app/Components/Footer";

export default function HomepageDesign() {
  const [scale, setScale] = useState(1);
  const [mounted, setMounted] = useState(false);
  const designWidth = 1440;
  const designHeight = 5841;
  const footerTop = 5526;

  useEffect(() => {
    setMounted(true);
    const handleResize = () => {
      const windowWidth = window.innerWidth;
      const newScale = Math.min(1, windowWidth / designWidth);
      setScale(newScale);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!mounted) return null;

  return (
    <div className="w-full bg-[#dbdbdb] overflow-x-hidden">
      {/* Scaled design — clipped at the footer boundary */}
      <div className="flex justify-center">
        <div
          className="relative overflow-hidden"
          style={{
            width: `${designWidth * scale}px`,
            height: `${footerTop * scale}px`,
          }}
        >
          <div
            style={{
              width: `${designWidth}px`,
              height: `${designHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <Desktop13 />
          </div>
        </div>
      </div>

      {/* Footer — full width, edge to edge */}
      <Footer />
    </div>
  );
}
