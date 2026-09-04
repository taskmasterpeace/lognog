import { describe, it, expect } from 'vitest';
import { expandMacros } from './macros.js';

/**
 * Search macros: reusable named DSL fragments referenced as `name` (backticks,
 * unused elsewhere in the DSL). Expanded before compilation. Supports nesting
 * (a macro can reference another) with a cycle guard.
 */
describe('expandMacros', () => {
  const macros: Record<string, string> = {
    errors: 'severity<=3',
    web_errors: 'search event.category=web http.response.status_code>=500',
    recent_errors: '`web_errors` | stats count', // nested reference
    loop_a: '`loop_b`',
    loop_b: '`loop_a`',
  };
  const resolve = (name: string): string | undefined => macros[name];

  it('expands a simple macro reference', () => {
    expect(expandMacros('search `errors` | stats count', resolve)).toBe('search severity<=3 | stats count');
  });

  it('expands nested macros', () => {
    expect(expandMacros('`recent_errors`', resolve)).toBe(
      'search event.category=web http.response.status_code>=500 | stats count',
    );
  });

  it('leaves unknown macro references untouched', () => {
    expect(expandMacros('search `nope`', resolve)).toBe('search `nope`');
  });

  it('leaves queries with no macros untouched', () => {
    expect(expandMacros('search severity<=3 | stats count', resolve)).toBe('search severity<=3 | stats count');
  });

  it('throws on a macro cycle instead of looping forever', () => {
    expect(() => expandMacros('`loop_a`', resolve)).toThrow(/cycle|depth/i);
  });
});
