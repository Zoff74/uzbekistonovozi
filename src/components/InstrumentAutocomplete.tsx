"use client";
// src/components/InstrumentAutocomplete.tsx
import React, { useState, useEffect, useRef } from "react";

interface InstrumentAutocompleteProps {
  value: string;
  onChange: (value: string, id: string) => void;
  placeholder?: string;
  category?: string;
}

export default function InstrumentAutocomplete({
  value,
  onChange,
  placeholder = "Пианино, бас гитара, джембе...",
  category = "all",
}: InstrumentAutocompleteProps) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!query.trim() || query.length < 1) {
        setSuggestions([]);
        return;
      }

      try {
        const res = await fetch(`/api/instruments?q=${encodeURIComponent(query)}&category=${category}`);
        const data = await res.json();
        if (data.success) {
          setSuggestions(data.instruments || []);
          setIsOpen(true);
        }
      } catch (err) {
        console.error("Error fetching instrument suggestions:", err);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [query, category]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (instrument: any) => {
    setQuery(instrument.name);
    onChange(instrument.name, instrument._id);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val, "");
    setIsOpen(true);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        placeholder={placeholder}
        style={{ backgroundColor: '#000000', color: '#ffffff' }}
        className="p-3.5 border-2 rounded-xl w-full font-medium focus:outline-none transition-colors duration-300 border-[#39FF14]/50 focus:border-[#39FF14]"
        autoComplete="off"
      />

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-black border-2 border-[#39FF14]/50 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          {suggestions.map((item) => (
            <li
              key={item._id}
              onClick={() => handleSelect(item)}
              className="px-4 py-2.5 hover:bg-[#39FF14]/10 cursor-pointer flex justify-between items-center text-sm text-white transition-colors border-b border-neutral-800 last:border-b-0"
            >
              <span>{item.name}</span>
              <span className="text-xs text-[#FFDA09] bg-neutral-900 px-2 py-0.5 rounded-md border border-[#FFDA09]/30">
                {item.usageCount} музыкант(ов)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}