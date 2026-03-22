import React from "react";
import {
  EnvelopeClosedIcon,
  InstagramLogoIcon,
  LinkedInLogoIcon,
} from "@radix-ui/react-icons";

// The decoration image used on the sides of the home footer
const decorationImg = "/homepage/char-7.png";

export default function Footer() {
  return (
    <footer className="relative w-full bg-[#161616] overflow-hidden flex flex-col items-center justify-center py-12 min-h-[315px] mt-auto">
      {/* Left Decoration */}
      <div className="absolute left-0 top-0 bottom-0 w-[40vw] sm:w-[350px] opacity-60 pointer-events-none">
        <div className="absolute inset-0 overflow-hidden">
          <img
            alt=""
            className="absolute h-[600%] left-[-15%] max-w-none top-[-469%] w-[180%] object-cover"
            src={decorationImg}
          />
        </div>
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Right Decoration */}
      <div className="absolute right-0 top-0 bottom-0 w-[40vw] sm:w-[350px] opacity-60 pointer-events-none">
        <div className="absolute inset-0 overflow-hidden">
          <img
            alt=""
            className="absolute h-[600%] right-[-66%] max-w-none top-[-16%] w-[181%] object-cover"
            src={decorationImg}
          />
        </div>
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* GDG Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gdg.svg"
          alt="Google Developer Groups"
          className="h-10 md:h-12 w-auto mb-10 object-contain"
        />

        {/* Social Icons */}
        <div className="flex items-center gap-8 mb-10">
          <a
            href="https://www.instagram.com/gdg_rbu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-gray-300 transition-colors"
          >
            <InstagramLogoIcon className="w-7 h-7" />
          </a>
          <a
            href="https://www.linkedin.com/company/gdg-rbu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-gray-300 transition-colors"
          >
            <LinkedInLogoIcon className="w-7 h-7" />
          </a>
          <a
            href="mailto:contact@gdgrbu.tech"
            className="text-white hover:text-gray-300 transition-colors"
          >
            <EnvelopeClosedIcon className="w-7 h-7" />
          </a>
          <a
            href="https://x.com/gdsc_rcoem"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-gray-300 transition-colors flex items-center justify-center"
          >
            {/* Custom SVG for X / Twitter */}
            <svg
              className="w-6 h-6 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
            </svg>
          </a>
        </div>

        {/* Website Link */}
        <p className="text-white font-['HvDTrial_Brandon_Grotesque:Medium',sans-serif] tracking-[1.7px] text-sm md:text-[17px] text-center uppercase">
          Meet us on{" "}
          <a
            href="https://www.gdgrbu.tech"
            className="underline hover:text-gray-300 transition-colors pointer-events-auto"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.gdgrbu.tech
          </a>
        </p>
      </div>
    </footer>
  );
}
