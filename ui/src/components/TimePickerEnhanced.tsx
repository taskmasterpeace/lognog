import { useState, useRef, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './TimePicker.css';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { Tooltip } from './ui/Tooltip';

interface TimeRange {
  label: string;
  value: string;
  earliest: string;
  latest?: string;
}

interface TimePresetGroup {
  label: string;
  presets: TimeRange[];
}

interface TimePickerProps {
  onRangeChange: (earliest: string, latest?: string) => void;
  defaultRange?: string;
  className?: string;
}

// Time units for relative input
const TIME_UNITS = [
  { label: 'Minutes', value: 'm', short: 'min' },
  { label: 'Hours', value: 'h', short: 'hr' },
  { label: 'Days', value: 'd', short: 'day' },
  { label: 'Weeks', value: 'w', short: 'wk' },
];

// Grouped time presets for better organization
const TIME_PRESET_GROUPS: TimePresetGroup[] = [
  {
    label: 'Quick',
    presets: [
      { label: 'Last 15 minutes', value: '-15m', earliest: '-15m' },
      { label: 'Last 1 hour', value: '-1h', earliest: '-1h' },
      { label: 'Last 24 hours', value: '-24h', earliest: '-24h' },
      { label: 'Last 7 days', value: '-7d', earliest: '-7d' },
    ],
  },
  {
    label: 'Minutes',
    presets: [
      { label: 'Last 5 minutes', value: '-5m', earliest: '-5m' },
      { label: 'Last 15 minutes', value: '-15m', earliest: '-15m' },
      { label: 'Last 30 minutes', value: '-30m', earliest: '-30m' },
      { label: 'Last 45 minutes', value: '-45m', earliest: '-45m' },
    ],
  },
  {
    label: 'Hours',
    presets: [
      { label: 'Last 1 hour', value: '-1h', earliest: '-1h' },
      { label: 'Last 2 hours', value: '-2h', earliest: '-2h' },
      { label: 'Last 4 hours', value: '-4h', earliest: '-4h' },
      { label: 'Last 6 hours', value: '-6h', earliest: '-6h' },
      { label: 'Last 12 hours', value: '-12h', earliest: '-12h' },
      { label: 'Last 24 hours', value: '-24h', earliest: '-24h' },
    ],
  },
  {
    label: 'Days',
    presets: [
      { label: 'Today', value: '-0d@d', earliest: '-0d@d' },
      { label: 'Yesterday', value: '-1d@d', earliest: '-1d@d', latest: '-0d@d' },
      { label: 'Last 2 days', value: '-2d', earliest: '-2d' },
      { label: 'Last 3 days', value: '-3d', earliest: '-3d' },
      { label: 'Last 7 days', value: '-7d', earliest: '-7d' },
      { label: 'Last 14 days', value: '-14d', earliest: '-14d' },
      { label: 'Last 30 days', value: '-30d', earliest: '-30d' },
    ],
  },
  {
    label: 'Weeks & Months',
    presets: [
      { label: 'This week', value: '-0w@w', earliest: '-0w@w' },
      { label: 'Last week', value: '-1w@w', earliest: '-1w@w', latest: '-0w@w' },
      { label: 'Last 2 weeks', value: '-2w', earliest: '-2w' },
      { label: 'Last 4 weeks', value: '-4w', earliest: '-4w' },
      { label: 'This month', value: '-0M@M', earliest: '-0M@M' },
      { label: 'Last 3 months', value: '-3M', earliest: '-3M' },
      { label: 'Last 6 months', value: '-6M', earliest: '-6M' },
    ],
  },
  {
    label: 'Other',
    presets: [
      { label: 'All time', value: 'all', earliest: '' },
    ],
  },
];

// Flat list of all presets for lookup
const ALL_PRESETS: TimeRange[] = TIME_PRESET_GROUPS.flatMap(g => g.presets);

type ViewMode = 'presets' | 'relative' | 'absolute';

/**
 * Generates a relative time tooltip description for a time preset
 */
function getPresetTooltip(preset: TimeRange): string {
  if (preset.value === 'all') {
    return 'Show all available logs without time restriction';
  }
  if (preset.value === 'custom') {
    return 'Select a custom date and time range';
  }

  // Handle snap-to patterns like -0d@d (today), -1w@w (this week)
  if (preset.value.includes('@')) {
    return `${preset.label} - snaps to start of period`;
  }

  // Parse the value to get the unit and amount
  const match = preset.value.match(/^-(\d+)([mhdwM])$/);
  if (!match) return preset.label;

  const amount = parseInt(match[1], 10);
  const unit = match[2];

  const unitNames: Record<string, { singular: string; plural: string }> = {
    'm': { singular: 'minute', plural: 'minutes' },
    'h': { singular: 'hour', plural: 'hours' },
    'd': { singular: 'day', plural: 'days' },
    'w': { singular: 'week', plural: 'weeks' },
    'M': { singular: 'month', plural: 'months' },
  };

  const unitName = amount === 1 ? unitNames[unit]?.singular : unitNames[unit]?.plural;
  if (!unitName) return preset.label;

  return `Shows logs from ${amount} ${unitName} ago to now`;
}

export default function TimePickerEnhanced({ onRangeChange, defaultRange = '-24h', className = '' }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('presets');
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Quick');

  const [selectedPreset, setSelectedPreset] = useState<TimeRange>(() => {
    const saved = localStorage.getItem('lognog_time_range');
    if (saved) {
      const preset = ALL_PRESETS.find(p => p.value === saved);
      if (preset) return preset;
    }
    return ALL_PRESETS.find(p => p.value === defaultRange) || ALL_PRESETS.find(p => p.value === '-24h')!;
  });

  // Relative time input state
  const [relativeAmount, setRelativeAmount] = useState<number>(24);
  const [relativeUnit, setRelativeUnit] = useState<string>('h');

  // Absolute date picker state
  const [startDate, setStartDate] = useState<Date | null>(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState<Date | null>(new Date());

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize with saved time range on mount
  useEffect(() => {
    const saved = localStorage.getItem('lognog_time_range');
    if (saved && saved !== 'custom') {
      const preset = ALL_PRESETS.find(p => p.value === saved);
      if (preset) {
        onRangeChange(preset.earliest, preset.latest);
      }
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handlePresetSelect = (preset: TimeRange) => {
    setSelectedPreset(preset);
    setIsOpen(false);
    localStorage.setItem('lognog_time_range', preset.value);
    onRangeChange(preset.earliest, preset.latest);
  };

  const handleRelativeApply = () => {
    const value = `-${relativeAmount}${relativeUnit}`;
    const preset: TimeRange = {
      label: `Last ${relativeAmount} ${TIME_UNITS.find(u => u.value === relativeUnit)?.label.toLowerCase() || relativeUnit}`,
      value,
      earliest: value,
    };
    setSelectedPreset(preset);
    setIsOpen(false);
    localStorage.setItem('lognog_time_range', value);
    onRangeChange(value);
  };

  const handleAbsoluteApply = () => {
    if (startDate && endDate) {
      const earliest = startDate.toISOString();
      const latest = endDate.toISOString();
      setIsOpen(false);

      const preset: TimeRange = {
        label: 'Custom range',
        value: 'custom',
        earliest,
        latest,
      };
      setSelectedPreset(preset);
      onRangeChange(earliest, latest);
    }
  };

  const formatShortText = () => {
    if (selectedPreset.value === 'custom' && selectedPreset.latest) {
      return 'Custom';
    }
    if (selectedPreset.value === 'all') {
      return 'All';
    }
    // Extract short form (e.g., "-24h" -> "24h")
    return selectedPreset.value.replace('-', '').replace('@d', '').replace('@w', '').replace('@M', '');
  };

  const formatDisplayText = () => {
    if (selectedPreset.value === 'custom' && selectedPreset.latest) {
      const start = new Date(selectedPreset.earliest);
      const end = new Date(selectedPreset.latest);
      return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    }
    return selectedPreset.label;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-secondary h-11 sm:h-12 min-w-[90px] sm:min-w-[160px] group px-2 sm:px-4"
        title={formatDisplayText()}
      >
        <Clock className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-all duration-200 group-hover:scale-110" />
        <span className="font-medium text-sm sm:text-base">{formatShortText()}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 hidden sm:block ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="dropdown right-0 w-80 sm:w-96 animate-fade-in max-h-[80vh] overflow-hidden flex flex-col">
          {/* Tab Headers */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-nog-50 dark:bg-nog-800">
            <button
              onClick={() => setViewMode('presets')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                viewMode === 'presets'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-white dark:bg-nog-900'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Presets
            </button>
            <button
              onClick={() => setViewMode('relative')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                viewMode === 'relative'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-white dark:bg-nog-900'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Relative
            </button>
            <button
              onClick={() => setViewMode('absolute')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                viewMode === 'absolute'
                  ? 'text-sky-600 border-b-2 border-sky-500 bg-white dark:bg-nog-900'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Absolute
            </button>
          </div>

          {/* Content Area */}
          <div className="overflow-y-auto flex-1">
            {viewMode === 'presets' && (
              /* Grouped Preset Selection */
              <div className="py-1">
                {TIME_PRESET_GROUPS.map((group) => (
                  <div key={group.label} className="border-b border-slate-100 dark:border-slate-700 last:border-0">
                    {/* Group Header */}
                    <button
                      onClick={() => setExpandedGroup(expandedGroup === group.label ? null : group.label)}
                      className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:bg-nog-50 dark:hover:bg-nog-800"
                    >
                      <span>{group.label}</span>
                      <ChevronRight
                        className={`w-4 h-4 transition-transform duration-200 ${
                          expandedGroup === group.label ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {/* Group Presets */}
                    {expandedGroup === group.label && (
                      <div className="pb-1">
                        {group.presets.map((preset) => (
                          <Tooltip
                            key={preset.value}
                            content={getPresetTooltip(preset)}
                            placement="left"
                            delay={300}
                          >
                            <button
                              onClick={() => handlePresetSelect(preset)}
                              className={`dropdown-item w-full text-left pl-8 pr-4 py-2 text-sm transition-all duration-150 ${
                                selectedPreset.value === preset.value
                                  ? 'bg-sky-50 text-sky-600 font-medium dark:bg-sky-900/20 dark:text-sky-400'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-nog-50 dark:hover:bg-nog-800'
                              }`}
                            >
                              {preset.label}
                            </button>
                          </Tooltip>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {viewMode === 'relative' && (
              /* Relative Time Input */
              <div className="p-4 space-y-4">
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Enter a relative time range from now
                </div>

                <div className="flex gap-3">
                  {/* Amount Input */}
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Amount
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={relativeAmount}
                      onChange={(e) => setRelativeAmount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="input text-sm w-full"
                      placeholder="24"
                    />
                  </div>

                  {/* Unit Selector */}
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Unit
                    </label>
                    <select
                      value={relativeUnit}
                      onChange={(e) => setRelativeUnit(e.target.value)}
                      className="input text-sm w-full"
                    >
                      {TIME_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview */}
                <div className="p-3 bg-nog-50 dark:bg-nog-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Preview</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-slate-100">
                    Last {relativeAmount} {TIME_UNITS.find(u => u.value === relativeUnit)?.label.toLowerCase()}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    earliest: -{relativeAmount}{relativeUnit}
                  </p>
                </div>

                {/* Apply Button */}
                <button
                  onClick={handleRelativeApply}
                  className="btn-primary w-full text-sm"
                >
                  Apply
                </button>
              </div>
            )}

            {viewMode === 'absolute' && (
              /* Absolute Date/Time Picker */
              <div className="p-4 space-y-4">
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Select exact start and end dates
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Start Date & Time
                  </label>
                  <DatePicker
                    selected={startDate}
                    onChange={(date: Date | null) => setStartDate(date)}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={15}
                    dateFormat="MMM d, yyyy h:mm aa"
                    maxDate={endDate || undefined}
                    className="input text-sm w-full"
                    placeholderText="Select start date"
                    wrapperClassName="w-full"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    End Date & Time
                  </label>
                  <DatePicker
                    selected={endDate}
                    onChange={(date: Date | null) => setEndDate(date)}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={15}
                    dateFormat="MMM d, yyyy h:mm aa"
                    minDate={startDate || undefined}
                    maxDate={new Date()}
                    className="input text-sm w-full"
                    placeholderText="Select end date"
                    wrapperClassName="w-full"
                  />
                </div>

                {/* Preview */}
                {startDate && endDate && (
                  <div className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800">
                    <p className="text-xs font-medium text-sky-900 dark:text-sky-300 mb-1">Selected Range</p>
                    <p className="text-sm text-sky-700 dark:text-sky-400 font-mono">
                      {startDate.toLocaleString()}
                      <br />
                      <span className="text-sky-400 dark:text-sky-600">to</span>
                      <br />
                      {endDate.toLocaleString()}
                    </p>
                    <p className="text-xs text-sky-600 dark:text-sky-500 mt-2">
                      Duration: {Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60))} hours
                    </p>
                  </div>
                )}

                {/* Apply Button */}
                <button
                  onClick={handleAbsoluteApply}
                  disabled={!startDate || !endDate}
                  className="btn-primary w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visual Display - Selected Range Info (for custom ranges) */}
      {selectedPreset.value === 'custom' && selectedPreset.latest && (
        <div className="absolute top-full left-0 right-0 mt-1 px-3 py-2 bg-white dark:bg-nog-800 border border-sky-200 dark:border-sky-700 rounded-lg shadow-sm text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sky-700 dark:text-sky-400">Custom:</span>
            <span className="font-mono text-xs">
              {new Date(selectedPreset.earliest).toLocaleString()} - {new Date(selectedPreset.latest).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
