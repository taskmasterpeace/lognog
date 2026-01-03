// Type definitions for Search Autocomplete

export type SuggestionCategory =
  | 'command'
  | 'aggregation'
  | 'eval-function'
  | 'field'
  | 'value'
  | 'operator'
  | 'history'
  | 'keyword';

export interface Suggestion {
  id: string;
  label: string;
  insertText: string;
  category: SuggestionCategory;
  description?: string;
  syntax?: string;
  example?: string;
  score: number;
}

export type ContextType =
  | 'start'
  | 'after-pipe'
  | 'command-args'
  | 'field-name'
  | 'field-value'
  | 'aggregation'
  | 'eval-expression'
  | 'by-clause'
  | 'operator'
  | 'span-value'
  | 'unknown';

export interface CursorContext {
  type: ContextType;
  prefix: string;
  fieldName?: string;
  commandName?: string;
  position: number;
  beforeCursor: string;
  afterCursor: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  syntax: string;
  example: string;
  expectsFields?: boolean;
  expectsAggregation?: boolean;
  expectsExpression?: boolean;
  expectsNumber?: boolean;
  aliases?: string[];
}

export interface AutocompleteState {
  isOpen: boolean;
  suggestions: Suggestion[];
  selectedIndex: number;
  loading: boolean;
  context: CursorContext | null;
}
