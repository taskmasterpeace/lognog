import { describe, it, expect } from 'vitest';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { Compiler } from './compiler';
import { SQLiteCompiler } from './compiler-sqlite';

function parseAndCompile(query: string) {
  const lexer = new Lexer(query);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const compiler = new Compiler(ast);
  return compiler.compile();
}

function parseAndCompileSQLite(query: string) {
  const lexer = new Lexer(query);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const compiler = new SQLiteCompiler(ast);
  return compiler.compile();
}

describe('Eval - Math Functions', () => {
  it('compiles abs function', () => {
    const result = parseAndCompile('search * | eval latency_abs = abs(latency)');
    expect(result.sql).toContain('abs(latency) AS latency_abs');
  });

  it('compiles round function without decimals', () => {
    const result = parseAndCompile('search * | eval latency_rounded = round(latency)');
    expect(result.sql).toContain('round(latency) AS latency_rounded');
  });

  it('compiles round function with decimals', () => {
    const result = parseAndCompile('search * | eval latency_rounded = round(latency, 2)');
    expect(result.sql).toContain('round(latency, 2) AS latency_rounded');
  });

  it('compiles floor function', () => {
    const result = parseAndCompile('search * | eval latency_floor = floor(latency)');
    expect(result.sql).toContain('floor(latency) AS latency_floor');
  });

  it('compiles ceil function', () => {
    const result = parseAndCompile('search * | eval latency_ceil = ceil(latency)');
    expect(result.sql).toContain('ceil(latency) AS latency_ceil');
  });

  it('compiles sqrt function', () => {
    const result = parseAndCompile('search * | eval latency_sqrt = sqrt(latency)');
    expect(result.sql).toContain('sqrt(latency) AS latency_sqrt');
  });

  it('compiles pow function', () => {
    const result = parseAndCompile('search * | eval latency_squared = pow(latency, 2)');
    expect(result.sql).toContain('pow(latency, 2) AS latency_squared');
  });

  it('compiles log function', () => {
    const result = parseAndCompile('search * | eval latency_log = log(latency)');
    expect(result.sql).toContain('log(latency) AS latency_log');
  });

  it('compiles log10 function', () => {
    const result = parseAndCompile('search * | eval latency_log10 = log10(latency)');
    expect(result.sql).toContain('log10(latency) AS latency_log10');
  });

  it('compiles exp function', () => {
    const result = parseAndCompile('search * | eval latency_exp = exp(latency)');
    expect(result.sql).toContain('exp(latency) AS latency_exp');
  });
});

describe('Eval - String Functions', () => {
  it('compiles length function', () => {
    const result = parseAndCompile('search * | eval msg_len = length(message)');
    expect(result.sql).toContain('length(message) AS msg_len');
  });

  it('compiles len function (alias)', () => {
    const result = parseAndCompile('search * | eval msg_len = len(message)');
    expect(result.sql).toContain('length(message) AS msg_len');
  });

  it('compiles lower function', () => {
    const result = parseAndCompile('search * | eval hostname_lower = lower(hostname)');
    expect(result.sql).toContain('lower(hostname) AS hostname_lower');
  });

  it('compiles upper function', () => {
    const result = parseAndCompile('search * | eval hostname_upper = upper(hostname)');
    expect(result.sql).toContain('upper(hostname) AS hostname_upper');
  });

  it('compiles substr function with 3 args', () => {
    const result = parseAndCompile('search * | eval domain = substr(hostname, 0, 10)');
    expect(result.sql).toContain('substring(hostname, 0, 10) AS domain');
  });

  it('compiles substring function with 2 args', () => {
    const result = parseAndCompile('search * | eval rest = substring(hostname, 5)');
    expect(result.sql).toContain('substring(hostname, 5) AS rest');
  });

  it('compiles trim function', () => {
    const result = parseAndCompile('search * | eval msg_trimmed = trim(message)');
    expect(result.sql).toContain('trim(message) AS msg_trimmed');
  });

  it('compiles ltrim function', () => {
    const result = parseAndCompile('search * | eval msg_ltrim = ltrim(message)');
    expect(result.sql).toContain('trimLeft(message) AS msg_ltrim');
  });

  it('compiles rtrim function', () => {
    const result = parseAndCompile('search * | eval msg_rtrim = rtrim(message)');
    expect(result.sql).toContain('trimRight(message) AS msg_rtrim');
  });

  it('compiles replace function', () => {
    const result = parseAndCompile('search * | eval msg_replaced = replace(message, "error", "warning")');
    expect(result.sql).toContain('replaceAll(message, \'error\', \'warning\') AS msg_replaced');
  });

  it('compiles split function with index', () => {
    const result = parseAndCompile('search * | eval first_part = split(message, ",", 0)');
    expect(result.sql).toContain('arrayElement(splitByChar(\',\', message), 0 + 1) AS first_part');
  });

  it('compiles concat function', () => {
    const result = parseAndCompile('search * | eval full_name = concat(hostname, ":", app_name)');
    expect(result.sql).toContain('concat(hostname, \':\', app_name) AS full_name');
  });
});

describe('Eval - Conditional Functions', () => {
  it('compiles if function', () => {
    const result = parseAndCompile('search * | eval status = if(severity <= 3, "critical", "normal")');
    expect(result.sql).toContain('if(severity <= 3, \'critical\', \'normal\') AS status');
  });

  it('compiles coalesce function', () => {
    const result = parseAndCompile('search * | eval host = coalesce(hostname, "unknown")');
    expect(result.sql).toContain('coalesce(hostname, \'unknown\') AS host');
  });

  it('compiles nullif function', () => {
    const result = parseAndCompile('search * | eval normalized = nullif(hostname, "")');
    expect(result.sql).toContain('nullIf(hostname, \'\') AS normalized');
  });

  it('compiles case function', () => {
    const result = parseAndCompile('search * | eval level = case(severity, 0, "emerg", 1, "alert", "other")');
    expect(result.sql).toContain('multiIf(severity = 0, \'emerg\', severity = 1, \'alert\', \'other\') AS level');
  });
});

describe('Eval - Binary Operations', () => {
  it('compiles addition', () => {
    const result = parseAndCompile('search * | eval total = bytes_in + bytes_out');
    expect(result.sql).toContain('(bytes_in + bytes_out) AS total');
  });

  it('compiles subtraction', () => {
    const result = parseAndCompile('search * | eval diff = bytes_in - bytes_out');
    expect(result.sql).toContain('(bytes_in - bytes_out) AS diff');
  });

  it('compiles multiplication', () => {
    const result = parseAndCompile('search * | eval total_cost = quantity * price');
    expect(result.sql).toContain('(quantity * price) AS total_cost');
  });

  it('compiles division', () => {
    const result = parseAndCompile('search * | eval avg_latency = total_latency / num_requests');
    expect(result.sql).toContain('(total_latency / num_requests) AS avg_latency');
  });

  it('compiles modulo', () => {
    const result = parseAndCompile('search * | eval remainder = value % 10');
    expect(result.sql).toContain('(value % 10) AS remainder');
  });

  it('compiles complex expression with precedence', () => {
    const result = parseAndCompile('search * | eval result = 10 + 5 * 2');
    expect(result.sql).toContain('(10 + (5 * 2)) AS result');
  });

  it('compiles expression with parentheses', () => {
    const result = parseAndCompile('search * | eval result = (10 + 5) * 2');
    expect(result.sql).toContain('((10 + 5) * 2) AS result');
  });
});

describe('Eval - Nested Functions', () => {
  it('compiles nested math functions', () => {
    const result = parseAndCompile('search * | eval result = round(sqrt(latency), 2)');
    expect(result.sql).toContain('round(sqrt(latency), 2) AS result');
  });

  it('compiles nested string functions', () => {
    const result = parseAndCompile('search * | eval result = upper(trim(hostname))');
    expect(result.sql).toContain('upper(trim(hostname)) AS result');
  });

  it('compiles function with binary operation', () => {
    const result = parseAndCompile('search * | eval result = abs(bytes_in - bytes_out)');
    expect(result.sql).toContain('abs((bytes_in - bytes_out)) AS result');
  });

  it('compiles if with function calls', () => {
    const result = parseAndCompile('search * | eval status = if(len(message) > 100, "long", "short")');
    expect(result.sql).toContain('if(length(message) > 100, \'long\', \'short\') AS status');
  });
});

describe('Eval - Multiple Assignments', () => {
  it('compiles multiple eval assignments', () => {
    const result = parseAndCompile('search * | eval name_upper = upper(hostname), name_len = len(hostname)');
    expect(result.sql).toContain('upper(hostname) AS name_upper');
    expect(result.sql).toContain('length(hostname) AS name_len');
  });

  it('compiles multiple evals with different function types', () => {
    const result = parseAndCompile('search * | eval total = bytes_in + bytes_out, status = if(severity <= 3, "critical", "normal")');
    expect(result.sql).toContain('(bytes_in + bytes_out) AS total');
    expect(result.sql).toContain('if(severity <= 3, \'critical\', \'normal\') AS status');
  });
});

describe('Eval - SQLite Compiler', () => {
  it('compiles abs for SQLite', () => {
    const result = parseAndCompileSQLite('search * | eval latency_abs = abs(latency)');
    expect(result.sql).toContain('ABS(latency) AS latency_abs');
  });

  it('compiles round for SQLite', () => {
    const result = parseAndCompileSQLite('search * | eval latency_rounded = round(latency, 2)');
    expect(result.sql).toContain('ROUND(latency, 2) AS latency_rounded');
  });

  it('compiles floor for SQLite', () => {
    const result = parseAndCompileSQLite('search * | eval latency_floor = floor(latency)');
    expect(result.sql).toContain('CAST(latency AS INTEGER) AS latency_floor');
  });

  it('compiles upper for SQLite', () => {
    const result = parseAndCompileSQLite('search * | eval hostname_upper = upper(hostname)');
    expect(result.sql).toContain('UPPER(hostname) AS hostname_upper');
  });

  it('compiles concat for SQLite', () => {
    const result = parseAndCompileSQLite('search * | eval full_name = concat(hostname, ":", app_name)');
    expect(result.sql).toContain('(hostname || \':\' || app_name) AS full_name');
  });

  it('compiles if for SQLite', () => {
    const result = parseAndCompileSQLite('search * | eval status = if(severity <= 3, "critical", "normal")');
    expect(result.sql).toContain('CASE WHEN severity <= 3 THEN \'critical\' ELSE \'normal\' END AS status');
  });

  it('compiles case for SQLite', () => {
    const result = parseAndCompileSQLite('search * | eval level = case(severity, 0, "emerg", 1, "alert", "other")');
    expect(result.sql).toContain('CASE WHEN severity = 0 THEN \'emerg\' WHEN severity = 1 THEN \'alert\' ELSE \'other\' END AS level');
  });
});

describe('Eval - Field References', () => {
  it('compiles field references', () => {
    const result = parseAndCompile('search * | eval doubled = latency * 2');
    expect(result.sql).toContain('(latency * 2) AS doubled');
  });

  it('compiles mapped field names', () => {
    const result = parseAndCompile('search * | eval host_upper = upper(host)');
    // 'host' should be mapped to 'hostname'
    expect(result.sql).toContain('upper(hostname) AS host_upper');
  });

  it('compiles field references in functions', () => {
    const result = parseAndCompile('search * | eval msg_concat = concat(app, ": ", msg)');
    // 'app' -> 'app_name', 'msg' -> 'message'
    expect(result.sql).toContain('concat(app_name, \': \', message) AS msg_concat');
  });
});

describe('Eval - Complex Queries', () => {
  it('compiles eval after search and filter', () => {
    const result = parseAndCompile('search host=web1 | filter severity>=3 | eval status = if(severity <= 3, "critical", "normal")');
    expect(result.sql).toContain('hostname = \'web1\'');
    expect(result.sql).toContain('severity >= 3');
    expect(result.sql).toContain('if(severity <= 3, \'critical\', \'normal\') AS status');
  });

  it('compiles eval with stats', () => {
    const result = parseAndCompile('search * | eval latency_rounded = round(latency, 2) | stats avg(latency_rounded) by hostname');
    // When stats follows eval, the eval field should be used in the aggregation
    expect(result.sql).toContain('avg(latency_rounded)');
    expect(result.sql).toContain('hostname');
  });

  it('compiles full pipeline with eval', () => {
    const result = parseAndCompile(`
      search severity>=warning
      | eval name_upper = upper(hostname), latency_rounded = round(latency, 2)
      | stats count by name_upper
      | sort desc
      | limit 10
    `);
    // When stats follows eval, the eval fields are used in stats grouping/aggregation
    expect(result.sql).toContain('count() AS');
    expect(result.sql).toContain('name_upper');
    expect(result.sql).toContain('LIMIT 10');
  });
});
