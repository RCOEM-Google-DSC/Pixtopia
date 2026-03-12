"use client";

import React, { useRef } from "react";

interface SegmentedInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  revealedIndices?: number[];
}

const SegmentedInput: React.FC<SegmentedInputProps> = ({
  length,
  value,
  onChange,
  revealedIndices = [],
}) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value.toUpperCase();
    if (val.length > 1) return; // Only 1 char

    const newValue = value.split("");
    // Pad if necessary
    while(newValue.length < length) newValue.push(".");
    
    newValue[index] = val || ".";
    onChange(newValue.join(""));

    // Auto-focus next
    if (val && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !e.currentTarget.value && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const displayValue = value.split("");

  return (
    <div className="flex gap-2">
      {Array.from({ length }).map((_, i) => {
        const isRevealed = revealedIndices.includes(i);
        const char = displayValue[i] === "." ? "" : displayValue[i];

        return (
          <input
            key={i}
            ref={(el) => { inputsRef.current[i] = el; }}
            type="text"
            maxLength={1}
            value={char || ""}
            readOnly={isRevealed}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            aria-label={`Letter ${i + 1}`}
            className={`w-10 h-12 sm:w-12 sm:h-14 bg-zinc-900 border-2 rounded-lg text-center text-xl sm:text-2xl font-black text-white outline-none transition-all
              ${isRevealed ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-400" : "border-zinc-800 focus:border-indigo-500"}
            `}
          />
        );
      })}
    </div>
  );
};

export default SegmentedInput;
