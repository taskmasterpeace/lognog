// Context detection hook - analyzes cursor position to determine what suggestions to show

import { useMemo } from 'react';
import { CursorContext } from './autocomplete-types';
import { COMMANDS, FIELD_ALIASES } from './autocomplete-data';

const COMMAND_NAMES = COMMANDS.map(c => c.name);
const AGGREGATING_COMMANDS = ['stats', 'timechart'];
const FIELD_EXPECTING_COMMANDS = ['sort', 'dedup', 'table', 'fields', 'top', 'rare', 'bin', 'rename', 'rex'];

export function useContextDetection(
  query: string,
  cursorPosition: number
): CursorContext {
  return useMemo(() => {
    const beforeCursor = query.slice(0, cursorPosition);
    const afterCursor = query.slice(cursorPosition);

    // Find current "word" being typed (prefix for filtering)
    const prefixMatch = beforeCursor.match(/[\w._-]*$/);
    const prefix = prefixMatch ? prefixMatch[0] : '';

    // Analyze context
    const context = analyzeContext(beforeCursor, prefix);

    return {
      ...context,
      prefix,
      position: cursorPosition,
      beforeCursor,
      afterCursor,
    };
  }, [query, cursorPosition]);
}

function analyzeContext(
  beforeCursor: string,
  prefix: string
): Omit<CursorContext, 'prefix' | 'position' | 'beforeCursor' | 'afterCursor'> {
  const trimmed = beforeCursor.trimEnd();
  const withoutPrefix = beforeCursor.slice(0, beforeCursor.length - prefix.length).trimEnd();

  // Empty or just starting
  if (trimmed === '' || trimmed === prefix) {
    return { type: 'start' };
  }

  // After pipe - suggest commands
  if (trimmed.endsWith('|') || withoutPrefix.endsWith('|')) {
    return { type: 'after-pipe' };
  }

  // After span= - suggest span values
  if (/span\s*=\s*$/i.test(withoutPrefix)) {
    return { type: 'span-value' };
  }

  // After field= or field~ or field!= etc - suggest field values
  const fieldValueMatch = withoutPrefix.match(/(\w+)\s*[=~!<>]+\s*$/);
  if (fieldValueMatch) {
    const fieldName = resolveFieldAlias(fieldValueMatch[1]);
    return { type: 'field-value', fieldName };
  }

  // Inside eval expression (after eval fieldname=)
  if (isInsideEval(beforeCursor)) {
    return { type: 'eval-expression', commandName: 'eval' };
  }

  // After "by" keyword - suggest fields
  if (/\bby\s+$/i.test(withoutPrefix) || /\bby\s+[\w,\s]*,\s*$/i.test(withoutPrefix)) {
    return { type: 'by-clause' };
  }

  // After "as" keyword - let user type (alias name)
  if (/\bas\s+$/i.test(withoutPrefix)) {
    return { type: 'unknown' };
  }

  // Detect current command context
  const commandContext = findCurrentCommand(beforeCursor);

  if (commandContext) {
    const { command, afterCommandText } = commandContext;

    // After aggregating command (stats, timechart) - suggest aggregation functions
    if (AGGREGATING_COMMANDS.includes(command)) {
      // Right after command name or after comma
      if (!afterCommandText.trim() || afterCommandText.trimEnd().endsWith(',')) {
        return { type: 'aggregation', commandName: command };
      }
      // After aggregation function, might need "by" or "as"
      if (/\)\s*$/i.test(afterCommandText)) {
        return { type: 'command-args', commandName: command };
      }
    }

    // After sort command - suggest asc/desc or fields
    if (command === 'sort') {
      if (!afterCommandText.trim()) {
        return { type: 'command-args', commandName: command };
      }
    }

    // After field-expecting command - suggest fields
    if (FIELD_EXPECTING_COMMANDS.includes(command)) {
      return { type: 'field-name', commandName: command };
    }

    // After search/filter/where - suggest fields or operators
    if (['search', 'filter', 'where'].includes(command)) {
      // Check if we just typed a field name (no operator yet)
      if (prefix && !withoutPrefix.match(/[=<>!~]\s*$/)) {
        return { type: 'field-name', commandName: command };
      }
      return { type: 'command-args', commandName: command };
    }

    // Default command args
    return { type: 'command-args', commandName: command };
  }

  // No command found - at start of query, suggest fields or search implicitly
  // Check if typing a field name
  if (prefix && !withoutPrefix.match(/[=<>!~"']\s*$/)) {
    return { type: 'field-name' };
  }

  // After a quoted value or number - might need operator
  if (withoutPrefix.match(/["']\s*$/) || withoutPrefix.match(/\d+\s*$/)) {
    return { type: 'operator' };
  }

  return { type: 'unknown' };
}

function findCurrentCommand(
  text: string
): { command: string; afterCommandText: string } | null {
  // Find pipes to identify command boundaries
  const pipeIndex = text.lastIndexOf('|');
  const relevantText = pipeIndex >= 0 ? text.slice(pipeIndex + 1) : text;

  // Find command at start of this segment
  const commandMatch = relevantText.match(/^\s*(\w+)/);
  if (commandMatch && COMMAND_NAMES.includes(commandMatch[1].toLowerCase())) {
    const command = commandMatch[1].toLowerCase();
    const commandEndIndex = (commandMatch.index || 0) + commandMatch[0].length;
    const afterCommandText = relevantText.slice(commandEndIndex);
    return { command, afterCommandText };
  }

  return null;
}

function isInsideEval(text: string): boolean {
  // Find last eval command
  const evalMatch = text.match(/\beval\s+(\w+)\s*=\s*/gi);
  if (!evalMatch) return false;

  // Get the last eval match
  const lastEvalIndex = text.lastIndexOf(evalMatch[evalMatch.length - 1]);
  if (lastEvalIndex === -1) return false;

  // Check if we're still in that eval (no pipe after it)
  const afterEval = text.slice(lastEvalIndex);
  if (afterEval.includes('|')) return false;

  // We're in an eval expression
  return true;
}

function resolveFieldAlias(field: string): string {
  return FIELD_ALIASES[field.toLowerCase()] || field;
}
