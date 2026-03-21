"use client";

import React from "react";
import { motion } from "framer-motion";

interface MCQGridProps {
  options: string[];
  onSelect: (index: number) => void;
  selectedIndex?: number;
  disabled?: boolean;
}

const MCQGrid: React.FC<MCQGridProps> = ({
  options,
  onSelect,
  selectedIndex,
  disabled = false,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full relative z-10 pointer-events-auto">
      {options.map((option, index) => {
        const isSelected = selectedIndex === index;

        return (
          <motion.button
            key={index}
            whileHover={!disabled ? { scale: 1.02, translateY: -2 } : {}}
            whileTap={!disabled ? { scale: 0.98 } : {}}
            disabled={disabled}
            onClick={() => onSelect(index)}
            className={`
              relative flex items-center justify-center p-6 text-center rounded-2xl border-2 transition-all duration-300 backdrop-blur-md
              ${isSelected 
                ? "bg-white/40 border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]" 
                : "bg-black/40 border-white/40 hover:bg-white/20 hover:border-white/60"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <div className="flex flex-col gap-1 pointer-events-none">
              <span className={`text-xs font-black uppercase tracking-widest mb-1 ${isSelected ? "text-white" : "text-zinc-300"}`}>
                Option {String.fromCharCode(65 + index)}
              </span>
              <span className={`text-lg font-bold tracking-tight ${isSelected ? "text-white" : "text-white drop-shadow-md"}`}>
                {option}
              </span>
            </div>
            
            {isSelected && (
              <motion.div 
                layoutId="activeChoice"
                className="absolute inset-0 rounded-2xl border-2 border-white pointer-events-none"
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

export default MCQGrid;
