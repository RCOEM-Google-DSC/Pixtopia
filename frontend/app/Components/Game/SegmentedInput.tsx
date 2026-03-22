"use client";

import React, { useRef } from "react";

interface SegmentedInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  revealedIndices?: number[];
  disabled?: boolean;
}

const SegmentedInput: React.FC<SegmentedInputProps> = ({
  length,
  value,
  onChange,
  revealedIndices = [],
  disabled = false,
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
            readOnly={isRevealed || disabled}
            disabled={disabled}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            aria-label={`Letter ${i + 1}`}
            className={`w-10 h-14 sm:w-12 sm:h-16 bg-transparent border-0 border-b-4 rounded-none text-center text-2xl sm:text-4xl font-black outline-none transition-all
              ${disabled ? "opacity-50 cursor-not-allowed" : ""}
              ${isRevealed ? "border-black text-black" : "border-white/70 text-white focus:border-white focus:text-white pb-1"}
            `}
            style={{ boxShadow: "none" }}
          />
        );
      })}
    </div>
  );
};

export default SegmentedInput;
