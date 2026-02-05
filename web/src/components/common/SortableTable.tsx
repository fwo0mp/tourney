import { useState, useCallback } from 'react';

// Sort modes: absolute value descending, descending, ascending
export type SortMode = 'abs-desc' | 'desc' | 'asc';

export function getSortIndicator(mode: SortMode): string {
  switch (mode) {
    case 'abs-desc': return '↓|';
    case 'desc': return '↓';
    case 'asc': return '↑';
  }
}

// Cycle through sort modes
export function nextSortMode(current: SortMode): SortMode {
  switch (current) {
    case 'abs-desc': return 'desc';
    case 'desc': return 'asc';
    case 'asc': return 'abs-desc';
  }
}

// Hook for managing sort state
export function useSortState<T extends string>(defaultColumn: T, defaultMode: SortMode = 'abs-desc') {
  const [sortColumn, setSortColumn] = useState<T>(defaultColumn);
  const [sortMode, setSortMode] = useState<SortMode>(defaultMode);

  const handleSort = useCallback((column: T) => {
    if (column === sortColumn) {
      setSortMode(nextSortMode(sortMode));
    } else {
      setSortColumn(column);
      setSortMode('abs-desc');
    }
  }, [sortColumn, sortMode]);

  return { sortColumn, sortMode, handleSort };
}

// Generic sort function for arrays
export function sortData<T, C extends string = string>(
  data: T[],
  sortColumn: C,
  sortMode: SortMode,
  getValue: (item: T, column: C) => number | string
): T[] {
  return [...data].sort((a, b) => {
    const aVal = getValue(a, sortColumn);
    const bVal = getValue(b, sortColumn);

    // String comparison
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      const cmp = aVal.localeCompare(bVal);
      return sortMode === 'asc' ? cmp : -cmp;
    }

    // Numeric comparison
    const aNum = aVal as number;
    const bNum = bVal as number;

    if (sortMode === 'abs-desc') {
      return Math.abs(bNum) - Math.abs(aNum);
    } else if (sortMode === 'desc') {
      return bNum - aNum;
    } else {
      return aNum - bNum;
    }
  });
}

// Sortable header component
interface SortHeaderProps<T extends string> {
  label: string;
  column: T;
  currentColumn: T;
  sortMode: SortMode;
  onSort: (column: T) => void;
  align?: 'left' | 'right';
  className?: string;
}

export function SortHeader<T extends string>({
  label,
  column,
  currentColumn,
  sortMode,
  onSort,
  align = 'right',
  className = '',
}: SortHeaderProps<T>) {
  const isActive = column === currentColumn;
  return (
    <th
      className={`py-2 text-xs font-medium uppercase cursor-pointer hover:text-gray-700 select-none ${
        align === 'left' ? 'text-left' : 'text-right'
      } ${isActive ? 'text-gray-900' : 'text-gray-500'} ${className}`}
      onClick={() => onSort(column)}
    >
      {label}
      {isActive && (
        <span className="ml-1">{getSortIndicator(sortMode)}</span>
      )}
    </th>
  );
}

// Non-sortable header for consistency
interface StaticHeaderProps {
  label: string;
  align?: 'left' | 'right';
  className?: string;
}

export function StaticHeader({ label, align = 'right', className = '' }: StaticHeaderProps) {
  return (
    <th
      className={`py-2 text-xs font-medium uppercase text-gray-500 ${
        align === 'left' ? 'text-left' : 'text-right'
      } ${className}`}
    >
      {label}
    </th>
  );
}
