import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface MultiFilterOption {
  value: string;
  label: string;
}

interface MultiFilterPopoverProps {
  label: string;
  allLabel?: string;
  options: MultiFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function MultiFilterPopover({
  label,
  allLabel = 'الكل',
  options,
  selected,
  onChange,
  disabled = false,
  className,
}: MultiFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const isAll = selected.length === 0;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const summary = useMemo(() => {
    if (isAll) return allLabel;
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label || selected[0];
    }
    return `${selected.length} محدد`;
  }, [isAll, allLabel, selected, options]);

  const toggleValue = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between px-3 text-xs font-semibold bg-card hover:bg-muted/50 border-input',
            className
          )}
        >
          <span className="truncate">
            <span className="text-muted-foreground font-medium ml-1">{label}:</span>
            <span className={cn(!isAll && 'text-primary font-bold')}>{summary}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2 space-y-1.5">
        {options.length > 7 && (
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-2.5 top-2.5" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث..."
              className="h-8 pr-8 text-xs"
            />
          </div>
        )}
        <div className="max-h-60 overflow-y-auto space-y-0.5">
          <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-bold hover:bg-muted/60 cursor-pointer">
            <Checkbox checked={isAll} onCheckedChange={() => onChange([])} />
            <span>{allLabel}</span>
          </label>
          <div className="h-[1px] bg-border my-1" />
          {filteredOptions.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">لا توجد خيارات</div>
          ) : (
            filteredOptions.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-muted/60 cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleValue(opt.value)}
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
