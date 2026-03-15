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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
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
              relative flex items-center justify-center p-6 text-center rounded-2xl border-2 transition-all duration-300
              ${isSelected 
                ? "bg-indigo-600/20 border-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.3)]" 
                : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <div className="flex flex-col gap-1">
              <span className={`text-xs font-black uppercase tracking-widest mb-1 ${isSelected ? "text-indigo-400" : "text-zinc-500"}`}>
                Option {String.fromCharCode(65 + index)}
              </span>
              <span className={`text-lg font-bold tracking-tight ${isSelected ? "text-white" : "text-zinc-300"}`}>
                {option}
              </span>
            </div>
            
            {isSelected && (
              <motion.div 
                layoutId="activeChoice"
                className="absolute inset-0 rounded-2xl border-2 border-indigo-400/50 pointer-events-none"
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

export default MCQGrid;
