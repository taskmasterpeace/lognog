import { useState, useEffect } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';

export interface DashboardVariable {
  id: string;
  name: string;
  label?: string;
  type: 'query' | 'custom' | 'textbox' | 'interval';
  query?: string;
  default_value?: string;
  options?: string[];
  multi_select: boolean;
  include_all: boolean;
  current_value?: string | string[];
}

interface DashboardVariablesBarProps {
  variables: DashboardVariable[];
  values: Record<string, string | string[]>;
  onChange?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  editMode?: boolean;
  onValueChange?: (name: string, value: string | string[]) => void;
  onAddVariable?: () => void;
  onEditVariable?: (variable: DashboardVariable) => void;
  getOptions?: (variableId: string) => Promise<string[]>;
}

export function DashboardVariablesBar({
  variables,
  values,
  onChange,
  editMode = false,
  onValueChange,
  onAddVariable,
  onEditVariable,
  getOptions,
}: DashboardVariablesBarProps) {
  // Support both onChange (simple) and onValueChange (complex) patterns
  const handleValueChange = (name: string, value: string | string[]) => {
    if (onValueChange) {
      onValueChange(name, value);
    } else if (onChange) {
      onChange((prev) => ({ ...prev, [name]: typeof value === 'string' ? value : value.join(',') }));
    }
  };

  const getOptionsForVariable = async (variableId: string): Promise<string[]> => {
    if (getOptions) {
      return getOptions(variableId);
    }
    // Return options from variable definition if available
    const variable = variables.find(v => v.id === variableId);
    return variable?.options || [];
  };
  if (variables.length === 0 && !editMode) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
      {variables.map((variable) => (
        <VariableDropdown
          key={variable.id}
          variable={variable}
          value={values[variable.name] || variable.default_value || ''}
          onChange={(value) => handleValueChange(variable.name, value)}
          onEdit={editMode && onEditVariable ? () => onEditVariable(variable) : undefined}
          getOptions={getOptionsForVariable}
        />
      ))}

      {editMode && onAddVariable && (
        <button
          onClick={onAddVariable}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Variable
        </button>
      )}
    </div>
  );
}

interface VariableDropdownProps {
  variable: DashboardVariable;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  onEdit?: () => void;
  getOptions: (variableId: string) => Promise<string[]>;
}

function VariableDropdown({
  variable,
  value,
  onChange,
  onEdit,
  getOptions,
}: VariableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen && options.length === 0) {
      setLoading(true);
      getOptions(variable.id)
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, variable.id, getOptions, options.length]);

  const handleSelect = (option: string) => {
    if (variable.multi_select) {
      const currentValues = Array.isArray(value) ? value : value ? [value] : [];
      if (currentValues.includes(option)) {
        onChange(currentValues.filter((v) => v !== option));
      } else {
        onChange([...currentValues, option]);
      }
    } else {
      onChange(option);
      setIsOpen(false);
    }
  };

  const displayValue = Array.isArray(value)
    ? value.length > 0
      ? value.length === 1
        ? value[0]
        : `${value.length} selected`
      : variable.include_all
      ? 'All'
      : 'Select...'
    : value || (variable.include_all ? 'All' : 'Select...');

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (variable.type === 'textbox') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {variable.label || variable.name}:
        </span>
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="px-2 py-1 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 min-w-[120px]"
          placeholder={variable.default_value || 'Enter value...'}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {variable.label || variable.name}:
        </span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:border-slate-300 dark:hover:border-slate-500 transition-colors min-w-[120px]"
        >
          <span className="truncate">{displayValue}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            title="Edit variable"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg">
            {/* Search */}
            <div className="p-2 border-b border-slate-100 dark:border-slate-700">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-700"
                autoFocus
              />
            </div>

            {/* Options */}
            <div className="max-h-48 overflow-y-auto">
              {loading ? (
                <div className="p-3 text-center text-sm text-slate-500">Loading...</div>
              ) : filteredOptions.length === 0 ? (
                <div className="p-3 text-center text-sm text-slate-500">No options</div>
              ) : (
                <>
                  {variable.include_all && (
                    <button
                      onClick={() => handleSelect('*')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      {(Array.isArray(value) ? value.includes('*') : value === '*') && (
                        <Check className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="font-medium">All</span>
                    </button>
                  )}
                  {filteredOptions.map((option) => {
                    const isSelected = Array.isArray(value)
                      ? value.includes(option)
                      : value === option;
                    return (
                      <button
                        key={option}
                        onClick={() => handleSelect(option)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        {variable.multi_select ? (
                          <div
                            className={`w-4 h-4 rounded border ${
                              isSelected
                                ? 'bg-amber-500 border-amber-500'
                                : 'border-slate-300 dark:border-slate-500'
                            } flex items-center justify-center`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                        ) : isSelected ? (
                          <Check className="w-4 h-4 text-amber-500" />
                        ) : (
                          <span className="w-4" />
                        )}
                        <span className="truncate">{option}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {variable.multi_select && (
              <div className="p-2 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default DashboardVariablesBar;
