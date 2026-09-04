/**
 * MITRE ATT&CK(R) content: tactic/technique catalog + LogNog detection templates.
 *
 * ATT&CK is free to use for commercial purposes with attribution (see
 * ATTACK_ATTRIBUTION and the repo NOTICE). Detections are written against the
 * ECS/OCSF canonical field names produced by CIM normalization at ingest.
 */

import type { AlertTemplateData } from './alert-templates.js';

export const ATTACK_ATTRIBUTION =
  '(c) 2026 The MITRE Corporation. This work is reproduced and distributed with the ' +
  'permission of The MITRE Corporation. ATT&CK is a registered trademark of The MITRE ' +
  'Corporation; use within LogNog does not imply endorsement.';

export interface AttackTactic {
  id: string; // e.g. TA0006
  name: string; // e.g. Credential Access
  url: string;
}

export interface AttackTechnique {
  id: string; // e.g. T1110 or T1110.003
  name: string;
  tactic: string; // matches an AttackTactic.name
  url: string;
  description: string;
}

/** MITRE ATT&CK Enterprise tactics (the ones our detections touch, in kill-chain order). */
export const ATTACK_TACTICS: AttackTactic[] = [
  { id: 'TA0001', name: 'Initial Access', url: 'https://attack.mitre.org/tactics/TA0001/' },
  { id: 'TA0002', name: 'Execution', url: 'https://attack.mitre.org/tactics/TA0002/' },
  { id: 'TA0003', name: 'Persistence', url: 'https://attack.mitre.org/tactics/TA0003/' },
  { id: 'TA0004', name: 'Privilege Escalation', url: 'https://attack.mitre.org/tactics/TA0004/' },
  { id: 'TA0005', name: 'Defense Evasion', url: 'https://attack.mitre.org/tactics/TA0005/' },
  { id: 'TA0006', name: 'Credential Access', url: 'https://attack.mitre.org/tactics/TA0006/' },
  { id: 'TA0007', name: 'Discovery', url: 'https://attack.mitre.org/tactics/TA0007/' },
  { id: 'TA0008', name: 'Lateral Movement', url: 'https://attack.mitre.org/tactics/TA0008/' },
  { id: 'TA0009', name: 'Collection', url: 'https://attack.mitre.org/tactics/TA0009/' },
  { id: 'TA0010', name: 'Exfiltration', url: 'https://attack.mitre.org/tactics/TA0010/' },
  { id: 'TA0011', name: 'Command and Control', url: 'https://attack.mitre.org/tactics/TA0011/' },
  { id: 'TA0040', name: 'Impact', url: 'https://attack.mitre.org/tactics/TA0040/' },
];

/** ATT&CK techniques referenced by the shipped detections. */
export const ATTACK_TECHNIQUES: AttackTechnique[] = [
  { id: 'T1110', name: 'Brute Force', tactic: 'Credential Access', url: 'https://attack.mitre.org/techniques/T1110/', description: 'Repeated authentication attempts to guess credentials.' },
  { id: 'T1110.003', name: 'Password Spraying', tactic: 'Credential Access', url: 'https://attack.mitre.org/techniques/T1110/003/', description: 'A few common passwords tried across many accounts.' },
  { id: 'T1003.001', name: 'OS Credential Dumping: LSASS Memory', tactic: 'Credential Access', url: 'https://attack.mitre.org/techniques/T1003/001/', description: 'Access to LSASS process memory to extract credentials.' },
  { id: 'T1136', name: 'Create Account', tactic: 'Persistence', url: 'https://attack.mitre.org/techniques/T1136/', description: 'Creation of an account to maintain access.' },
  { id: 'T1098', name: 'Account Manipulation', tactic: 'Persistence', url: 'https://attack.mitre.org/techniques/T1098/', description: 'Modifying accounts/groups to maintain or elevate access.' },
  { id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'Execution', url: 'https://attack.mitre.org/techniques/T1059/', description: 'Execution via command and script interpreters.' },
  { id: 'T1059.001', name: 'PowerShell', tactic: 'Execution', url: 'https://attack.mitre.org/techniques/T1059/001/', description: 'Abuse of PowerShell for execution.' },
  { id: 'T1027', name: 'Obfuscated Files or Information', tactic: 'Defense Evasion', url: 'https://attack.mitre.org/techniques/T1027/', description: 'Encoded/obfuscated payloads to evade detection.' },
  { id: 'T1046', name: 'Network Service Discovery', tactic: 'Discovery', url: 'https://attack.mitre.org/techniques/T1046/', description: 'Scanning for hosts and listening services.' },
  { id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access', url: 'https://attack.mitre.org/techniques/T1190/', description: 'Exploiting an internet-facing application.' },
  { id: 'T1048', name: 'Exfiltration Over Alternative Protocol', tactic: 'Exfiltration', url: 'https://attack.mitre.org/techniques/T1048/', description: 'Large or unusual outbound data transfer.' },
  { id: 'T1078', name: 'Valid Accounts', tactic: 'Defense Evasion', url: 'https://attack.mitre.org/techniques/T1078/', description: 'Use of legitimate credentials, e.g. impossible travel.' },
];

export const getTechnique = (id: string): AttackTechnique | undefined =>
  ATTACK_TECHNIQUES.find((t) => t.id === id);

export interface AttackCoverage {
  attribution: string;
  summary: { techniques_total: number; techniques_covered: number };
  tactics: Array<
    AttackTactic & {
      covered: number;
      total: number;
      techniques: Array<{ id: string; name: string; covered: boolean; detection_count: number }>;
    }
  >;
}

/**
 * ATT&CK coverage view: which techniques the shipped detections can surface,
 * grouped by tactic. Pure over the static catalog + DETECTION_TEMPLATES.
 */
export function computeAttackCoverage(): AttackCoverage {
  const coveredIds = new Set(DETECTION_TEMPLATES.map((d) => d.attack_technique));

  const tactics = ATTACK_TACTICS.map((tactic) => {
    const techniques = ATTACK_TECHNIQUES.filter((t) => t.tactic === tactic.name).map((t) => ({
      id: t.id,
      name: t.name,
      covered: coveredIds.has(t.id),
      detection_count: DETECTION_TEMPLATES.filter((d) => d.attack_technique === t.id).length,
    }));
    return {
      ...tactic,
      techniques,
      covered: techniques.filter((t) => t.covered).length,
      total: techniques.length,
    };
  }).filter((t) => t.total > 0);

  return {
    attribution: ATTACK_ATTRIBUTION,
    summary: {
      techniques_total: ATTACK_TECHNIQUES.length,
      techniques_covered: coveredIds.size,
    },
    tactics,
  };
}

export interface DetectionTemplate extends AlertTemplateData {
  attack_technique: string; // ATT&CK technique id
  attack_tactic: string; // tactic name (denormalized for display)
}

const base = {
  category: 'security' as const,
  trigger_type: 'number_of_results' as const,
  trigger_condition: 'greater_than' as const,
  trigger_threshold: 0, // the DSL's own `where` clause does the thresholding
  schedule_type: 'cron' as const,
  throttle_enabled: true,
};

/**
 * Starter catalog — 10 high-value detections in real LogNog DSL, each mapped to
 * an ATT&CK technique. Queries target ECS/OCSF canonical fields (populated by
 * CIM normalization at ingest).
 */
export const DETECTION_TEMPLATES: DetectionTemplate[] = [
  {
    ...base, id: 'attack-ssh-rdp-brute-force', name: 'SSH/RDP Brute Force', attack_technique: 'T1110', attack_tactic: 'Credential Access',
    description: 'Many failed logins from one source IP (brute force).',
    search_query: 'search event.category=authentication event.outcome=failure | stats count dc(user.name) as users by source.ip | where count>20',
    cron_expression: '*/10 * * * *', time_range: '-15m', severity: 'high', throttle_window_seconds: 1800,
  },
  {
    ...base, id: 'attack-password-spraying', name: 'Password Spraying', attack_technique: 'T1110.003', attack_tactic: 'Credential Access',
    description: 'One source IP fails logins across many distinct accounts.',
    search_query: 'search event.category=authentication event.outcome=failure | stats dc(user.name) as targets count by source.ip | where targets>=10',
    cron_expression: '*/10 * * * *', time_range: '-30m', severity: 'high', throttle_window_seconds: 1800,
  },
  {
    ...base, id: 'attack-brute-force-success', name: 'Brute-Force Success', attack_technique: 'T1110', attack_tactic: 'Credential Access',
    description: 'A source IP with many failures then a success against a user.',
    search_query: 'search event.category=authentication | stats dc(event.outcome) as outcomes count by source.ip user.name | where outcomes>1 AND count>10',
    cron_expression: '*/10 * * * *', time_range: '-30m', severity: 'critical', throttle_window_seconds: 3600,
  },
  {
    ...base, id: 'attack-new-privileged-account', name: 'New Privileged Account', attack_technique: 'T1136', attack_tactic: 'Persistence',
    description: 'A privileged/admin account was created or added to a group.',
    search_query: 'search event.category=iam event.action IN (user-created,user-added-to-group) group.name~"Admin" | stats count by host.name user.name',
    cron_expression: '*/15 * * * *', time_range: '-1h', severity: 'high', throttle_window_seconds: 3600,
  },
  {
    ...base, id: 'attack-office-spawns-shell', name: 'Office App Spawns a Shell', attack_technique: 'T1059', attack_tactic: 'Execution',
    description: 'An Office application spawned a command shell (macro/exploit).',
    search_query: 'search event.category=process process.parent.name IN (winword.exe,excel.exe,outlook.exe) process.name IN (cmd.exe,powershell.exe,wscript.exe) | stats count by host.name user.name process.command_line',
    cron_expression: '*/10 * * * *', time_range: '-15m', severity: 'high', throttle_window_seconds: 1800,
  },
  {
    ...base, id: 'attack-powershell-encoded', name: 'PowerShell Encoded Command', attack_technique: 'T1059.001', attack_tactic: 'Execution',
    description: 'PowerShell run with an encoded/obfuscated command.',
    search_query: 'search event.category=process process.name=powershell.exe process.command_line~"-enc|-EncodedCommand|FromBase64String" | table _time host.name user.name process.command_line',
    cron_expression: '*/10 * * * *', time_range: '-15m', severity: 'high', throttle_window_seconds: 1800,
  },
  {
    ...base, id: 'attack-lsass-access', name: 'LSASS Access (Credential Dump)', attack_technique: 'T1003.001', attack_tactic: 'Credential Access',
    description: 'A process opened a handle to lsass.exe memory.',
    search_query: 'search event.code=10 process.target.name~"lsass.exe" | stats count by host.name process.name',
    cron_expression: '*/10 * * * *', time_range: '-15m', severity: 'critical', throttle_window_seconds: 3600,
  },
  {
    ...base, id: 'attack-port-host-scan', name: 'Port / Host Scan', attack_technique: 'T1046', attack_tactic: 'Discovery',
    description: 'One source touched many ports or many hosts (scanning).',
    search_query: 'search event.category=network | stats dc(destination.port) as ports dc(destination.ip) as hosts by source.ip | where ports>100 OR hosts>50',
    cron_expression: '*/15 * * * *', time_range: '-15m', severity: 'medium', throttle_window_seconds: 1800,
  },
  {
    ...base, id: 'attack-large-outbound', name: 'Large Outbound Transfer', attack_technique: 'T1048', attack_tactic: 'Exfiltration',
    description: 'An unusually large volume of data left the network from one host.',
    search_query: 'search event.category=network network.direction=outbound | stats sum(destination.bytes) as bytes_out by source.ip destination.ip | where bytes_out>1000000000',
    cron_expression: '0 * * * *', time_range: '-1h', severity: 'high', throttle_window_seconds: 3600,
  },
  {
    ...base, id: 'attack-web-app-attack', name: 'Web Application Attack', attack_technique: 'T1190', attack_tactic: 'Initial Access',
    description: 'Web request contains SQLi/traversal/XSS/RCE indicators.',
    search_query: 'search event.category=web url.original~"union select|\\.\\./|/etc/passwd|<script|base64_decode" | stats count by source.ip url.original',
    cron_expression: '*/10 * * * *', time_range: '-15m', severity: 'high', throttle_window_seconds: 1800,
  },
  {
    ...base, id: 'attack-impossible-travel', name: 'Impossible Travel', attack_technique: 'T1078', attack_tactic: 'Defense Evasion',
    description: 'A user authenticated successfully from multiple countries in a window.',
    search_query: 'search event.category=authentication event.outcome=success | stats dc(source.geo.country_name) as countries values(source.geo.country_name) as seen by user.name | where countries>1',
    cron_expression: '*/30 * * * *', time_range: '-1h', severity: 'medium', throttle_window_seconds: 3600,
  },
];
