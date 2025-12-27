import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SigilIcon } from "./SigilIcon";
import type { SigilName } from "./sigils";

interface CommandItem {
  id: string;
  type: "command" | "navigation" | "issue" | "world" | "run" | "recent";
  title: string;
  shortcut?: string;
  /** Can be an emoji string or a sigil name */
  icon?: string;
  /** If true, icon is a SigilName and should render as SigilIcon */
  isSigil?: boolean;
  action?: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandItem[];
  onSelect?: (item: CommandItem) => void;
  placeholder?: string;
}

// Simple fuzzy matching
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Check if all characters of query appear in order in text
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length;
}

// Group items by type
function groupItems(items: CommandItem[]): Record<string, CommandItem[]> {
  const groups: Record<string, CommandItem[]> = {};
  for (const item of items) {
    if (!groups[item.type]) {
      groups[item.type] = [];
    }
    groups[item.type].push(item);
  }
  return groups;
}

const TYPE_LABELS: Record<string, string> = {
  recent: "RECENT",
  command: "COMMANDS",
  navigation: "NAVIGATION",
  issue: "ISSUES",
  world: "WORLDS",
  run: "RUNS",
};

const TYPE_ORDER = ["recent", "command", "navigation", "issue", "world", "run"];

export function CommandPalette({
  isOpen,
  onClose,
  items = [],
  onSelect,
  placeholder = "Search commands, issues, worlds...",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      return items;
    }
    return items.filter(
      (item) =>
        fuzzyMatch(query, item.title) || fuzzyMatch(query, item.id) || fuzzyMatch(query, item.type)
    );
  }, [items, query]);

  // Group filtered items
  const groupedItems = useMemo(() => groupItems(filteredItems), [filteredItems]);

  // Flatten for keyboard navigation
  const flatItems = useMemo(() => {
    const result: CommandItem[] = [];
    for (const type of TYPE_ORDER) {
      if (groupedItems[type]) {
        result.push(...groupedItems[type]);
      }
    }
    // Add any remaining types not in TYPE_ORDER
    for (const [type, items] of Object.entries(groupedItems)) {
      if (!TYPE_ORDER.includes(type)) {
        result.push(...items);
      }
    }
    return result;
  }, [groupedItems]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            const item = flatItems[selectedIndex];
            item.action?.();
            onSelect?.(item);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatItems, selectedIndex, onSelect, onClose]
  );

  // Global keyboard listener for opening
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Toggle would be handled by parent component
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-void/80 backdrop-blur-sm"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Palette */}
        <motion.div
          className="relative w-full max-w-[600px] mx-4 overflow-hidden rounded-lg border border-slate bg-abyss shadow-modal"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 border-b border-slate p-4">
            <span className="text-tertiary">⌘</span>
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent text-primary outline-none placeholder:text-tertiary"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto p-2">
            {flatItems.length === 0 ? (
              <div className="p-4 text-center text-tertiary">No results found</div>
            ) : (
              TYPE_ORDER.filter((type) => groupedItems[type]?.length > 0).map((type) => (
                <div key={type} className="mb-2">
                  <div className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-tertiary">
                    {TYPE_LABELS[type] || type.toUpperCase()}
                  </div>
                  {groupedItems[type].map((item) => {
                    const index = flatItems.indexOf(item);
                    const isSelected = index === selectedIndex;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between rounded-md px-3 py-2 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-obsidian text-primary"
                            : "text-secondary hover:bg-obsidian/50"
                        }`}
                        onClick={() => {
                          item.action?.();
                          onSelect?.(item);
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div className="flex items-center gap-3">
                          {item.icon && (
                            <span className="text-tertiary">
                              {item.isSigil ? (
                                <SigilIcon name={item.icon as SigilName} size={16} />
                              ) : (
                                item.icon
                              )}
                            </span>
                          )}
                          <span>{item.title}</span>
                          <span className="text-xs text-tertiary">{item.type}</span>
                        </div>
                        {item.shortcut && (
                          <kbd className="px-2 py-0.5 text-xs bg-void rounded text-tertiary font-mono">
                            {item.shortcut}
                          </kbd>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 border-t border-slate p-2 text-xs text-tertiary">
            <span>
              <kbd className="px-1 bg-void rounded">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1 bg-void rounded">↵</kbd> select
            </span>
            <span>
              <kbd className="px-1 bg-void rounded">esc</kbd> close
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default CommandPalette;
