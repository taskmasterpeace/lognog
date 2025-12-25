import { useState, useRef, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './TimePicker.css';
import { Clock, Calendar, ChevronDown, X } from 'lucide-react';
import { Tooltip } from './ui/Tooltip';

interface TimeRange {
  label: string;
  value: string;
  earliest: string;
  latest?: string;
}

interface TimePickerProps {
  onRangeChange: (earliest: string, latest?: string) => void;
  defaultRange?: string;
  className?: string;
}

const TIME_PRESETS: TimeRange[] = [
  { label: 'Last 5 minutes', value: '-5m', earliest: '-5m' },
  { label: 'Last 15 minutes', value: '-15m', earliest: '-15m' },
  { label: 'Last 30 minutes', value: '-30m', earliest: '-30m' },
  { label: 'Last 1 hour', value: '-1h', earliest: '-1h' },
  { label: 'Last 4 hours', value: '-4h', earliest: '-4h' },
  { label: 'Last 12 hours', value: '-12h', earliest: '-12h' },
  { label: 'Last 24 hours', value: '-24h', earliest: '-24h' },
  { label: 'Last 7 days', value: '-7d', earliest: '-7d' },
  { label: 'Last 30 days', value: '-30d', earliest: '-30d' },
  { label: 'All time', value: 'all', earliest: '' },
  { label: 'Custom range', value: 'custom', earliest: 'custom' },
];

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

  // Parse the value to get the unit and amount
  const match = preset.value.match(/^-(\d+)([mhd])$/);
  if (!match) return preset.label;

  const amount = parseInt(match[1], 10);
  const unit = match[2];

  const unitNames: Record<string, { singular: string; plural: string }> = {
    'm': { singular: 'minute', plural: 'minutes' },
    'h': { singular: 'hour', plural: 'hours' },
    'd': { singular: 'day', plural: 'days' },
  };

  const unitName = amount === 1 ? unitNames[unit].singular : unitNames[unit].plural;

  return `Shows logs from ${amount} ${unitName} ago to now`;
}

export default function TimePicker({ onRangeChange, defaultRange = '-24h', className = '' }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<TimeRange>(() => {
    // Check localStorage for saved preference
    const saved = localStorage.getItem('lognog_time_range');
    if (saved) {
      const preset = TIME_PRESETS.find(p => p.value === saved);
      if (preset) return preset;
    }
    return TIME_PRESETS.find(p => p.value === defaultRange) || TIME_PRESETS[6];
  });
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState<Date | null>(new Date());

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize with saved time range on mount
  useEffect(() => {
    const saved = localStorage.getItem('lognog_time_range');
    if (saved && saved !== 'custom') {
      const preset = TIME_PRESETS.find(p => p.value === saved);
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
    if (preset.value === 'custom') {
      setIsCustomMode(true);
      setSelectedPreset(preset);
    } else {
      setIsCustomMode(false);
      setSelectedPreset(preset);
      setIsOpen(false);
      // Save to localStorage
      localStorage.setItem('lognog_time_range', preset.value);
      onRangeChange(preset.earliest, preset.latest);
    }
  };

  const handleCustomApply = () => {
    if (startDate && endDate) {
      const earliest = startDate.toISOString();
      const latest = endDate.toISOString();
      setIsOpen(false);
      setIsCustomMode(false);

      // Update the selected preset to show custom with dates
      setSelectedPreset({
        label: 'Custom range',
        value: 'custom',
        earliest,
        latest,
      });

      onRangeChange(earliest, latest);
    }
  };

  const handleCustomCancel = () => {
    setIsCustomMode(false);
    // Reset to last selected non-custom preset
    const lastPreset = TIME_PRESETS.find(p => p.value === selectedPreset.value && p.value !== 'custom') || TIME_PRESETS[6];
    setSelectedPreset(lastPreset);
  };

  const formatDisplayText = () => {
    if (selectedPreset.value === 'custom' && selectedPreset.latest) {
      // Show custom date range
      const start = new Date(selectedPreset.earliest);
      const end = new Date(selectedPreset.latest);
      return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    }
    return selectedPreset.label;
  };

  const formatShortText = () => {
    if (selectedPreset.value === 'custom' && selectedPreset.latest) {
      return 'Custom';
    }
    if (selectedPreset.value === 'all') {
      return 'All';
    }
    // Extract short form (e.g., "-24h" -> "24h")
    return selectedPreset.value.replace('-', '');
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-secondary h-12 min-w-[140px] group"
        title={formatDisplayText()}
      >
        <Clock className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-all duration-200 group-hover:scale-110" />
        <span className="font-medium">{formatShortText()}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="dropdown right-0 w-80 animate-fade-in">
          {!isCustomMode ? (
            /* Preset Selection */
            <div className="py-2">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Time Range
                </p>
              </div>
              {TIME_PRESETS.map((preset, index) => (
                <Tooltip
                  key={preset.value}
                  content={getPresetTooltip(preset)}
                  placement="left"
                  delay={300}
                >
                  <button
                    onClick={() => handlePresetSelect(preset)}
                    className={`dropdown-item flex items-center justify-between transition-all duration-150 animate-fade-in animate-stagger-${Math.min(index + 1, 8)} ${
                      selectedPreset.value === preset.value && !isCustomMode
                        ? 'bg-sky-50 text-sky-600 font-medium dark:bg-sky-900/20 dark:text-sky-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{preset.label}</span>
                    {preset.value === 'custom' && (
                      <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    )}
                  </button>
                </Tooltip>
              ))}
            </div>
          ) : (
            /* Custom Date/Time Picker */
            <div className="p-4 space-y-4 animate-slide-right">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <p className="text-sm font-semibold text-slate-900">Custom Time Range</p>
                <button
                  onClick={handleCustomCancel}
                  className="btn-ghost p-1 rounded-md"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
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
                  className="input text-sm"
                  placeholderText="Select start date"
                  wrapperClassName="w-full"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
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
                  className="input text-sm"
                  placeholderText="Select end date"
                  wrapperClassName="w-full"
                />
              </div>

              {/* Visual Display */}
              {startDate && endDate && (
                <div className="p-3 bg-sky-50 rounded-lg border border-sky-200">
                  <p className="text-xs font-medium text-sky-900 mb-1">Selected Range</p>
                  <p className="text-sm text-sky-700 font-mono">
                    {startDate.toLocaleString()} <br />
                    <span className="text-sky-400">to</span> <br />
                    {endDate.toLocaleString()}
                  </p>
                  <p className="text-xs text-sky-600 mt-2">
                    Duration: {Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60))} hours
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCustomCancel}
                  className="btn-secondary flex-1 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomApply}
                  disabled={!startDate || !endDate}
                  className="btn-primary flex-1 text-sm"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visual Display - Selected Range Info */}
      {selectedPreset.latest && (
        <div className="absolute top-full left-0 right-0 mt-1 px-3 py-2 bg-white border border-sky-200 rounded-lg shadow-sm text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sky-700">Custom:</span>
            <span className="font-mono">
              {new Date(selectedPreset.earliest).toLocaleString()} - {new Date(selectedPreset.latest).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
