import { Router, Request, Response } from 'express';
import {
  getSourceRoutingRules,
  getSourceRoutingRule,
  createSourceRoutingRule,
  updateSourceRoutingRule,
  deleteSourceRoutingRule,
} from '../db/sqlite.js';

const router = Router();

// Get all routing rules
router.get('/', (_req: Request, res: Response) => {
  try {
    const enabled = _req.query.enabled === 'true' ? true : _req.query.enabled === 'false' ? false : undefined;
    const rules = getSourceRoutingRules(enabled);
    return res.json(rules);
  } catch (error) {
    console.error('Error fetching routing rules:', error);
    return res.status(500).json({ error: 'Failed to fetch routing rules' });
  }
});

// Get single routing rule
router.get('/:id', (req: Request, res: Response) => {
  try {
    const rule = getSourceRoutingRule(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    return res.json(rule);
  } catch (error) {
    console.error('Error fetching routing rule:', error);
    return res.status(500).json({ error: 'Failed to fetch routing rule' });
  }
});

// Create routing rule
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, conditions, match_mode, target_index, priority, enabled } = req.body;

    if (!name || !conditions || !target_index) {
      return res.status(400).json({ error: 'name, conditions, and target_index are required' });
    }

    // Validate conditions is valid JSON array
    let parsedConditions;
    try {
      parsedConditions = typeof conditions === 'string' ? JSON.parse(conditions) : conditions;
      if (!Array.isArray(parsedConditions)) {
        return res.status(400).json({ error: 'conditions must be an array' });
      }
    } catch {
      return res.status(400).json({ error: 'conditions must be valid JSON array' });
    }

    const rule = createSourceRoutingRule({
      name,
      conditions: JSON.stringify(parsedConditions),
      match_mode: match_mode || 'all',
      target_index,
      priority: priority ?? 100,
      enabled: enabled ?? 1,
    });

    return res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating routing rule:', error);
    return res.status(500).json({ error: 'Failed to create routing rule' });
  }
});

// Update routing rule
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = getSourceRoutingRule(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }

    const updateData = { ...req.body };

    // Validate and stringify conditions if provided
    if (updateData.conditions) {
      try {
        const parsedConditions = typeof updateData.conditions === 'string'
          ? JSON.parse(updateData.conditions)
          : updateData.conditions;
        if (!Array.isArray(parsedConditions)) {
          return res.status(400).json({ error: 'conditions must be an array' });
        }
        updateData.conditions = JSON.stringify(parsedConditions);
      } catch {
        return res.status(400).json({ error: 'conditions must be valid JSON array' });
      }
    }

    const updated = updateSourceRoutingRule(req.params.id, updateData);
    return res.json(updated);
  } catch (error) {
    console.error('Error updating routing rule:', error);
    return res.status(500).json({ error: 'Failed to update routing rule' });
  }
});

// Delete routing rule
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteSourceRoutingRule(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting routing rule:', error);
    return res.status(500).json({ error: 'Failed to delete routing rule' });
  }
});

// Evaluate routing rules against sample log
router.post('/evaluate', (req: Request, res: Response) => {
  try {
    const { sample_log, hostname, app_name, source_type } = req.body;

    if (!sample_log && !hostname && !app_name && !source_type) {
      return res.status(400).json({ error: 'At least one of sample_log, hostname, app_name, or source_type is required' });
    }

    const rules = getSourceRoutingRules(true);
    const matches: Array<{
      rule_id: string;
      rule_name: string;
      target_index: string;
      priority: number;
      matched_conditions: string[];
    }> = [];

    for (const rule of rules) {
      let conditions;
      try {
        conditions = JSON.parse(rule.conditions);
      } catch {
        continue;
      }

      const matchedConditions: string[] = [];
      let allMatch = true;
      let anyMatch = false;

      for (const condition of conditions) {
        let matched = false;

        // Condition format: { field: "hostname", operator: "equals|contains|regex", value: "..." }
        const { field, operator, value } = condition;
        let testValue: string | undefined;

        switch (field) {
          case 'hostname':
            testValue = hostname;
            break;
          case 'app_name':
            testValue = app_name;
            break;
          case 'source_type':
            testValue = source_type;
            break;
          case 'message':
            testValue = sample_log;
            break;
          default:
            testValue = undefined;
        }

        if (testValue !== undefined) {
          switch (operator) {
            case 'equals':
              matched = testValue === value;
              break;
            case 'contains':
              matched = testValue.includes(value);
              break;
            case 'regex':
              try {
                matched = new RegExp(value).test(testValue);
              } catch {
                matched = false;
              }
              break;
            case 'starts_with':
              matched = testValue.startsWith(value);
              break;
            case 'ends_with':
              matched = testValue.endsWith(value);
              break;
            default:
              matched = false;
          }
        }

        if (matched) {
          matchedConditions.push(`${field} ${operator} "${value}"`);
          anyMatch = true;
        } else {
          allMatch = false;
        }
      }

      const ruleMatches = rule.match_mode === 'all' ? allMatch : anyMatch;

      if (ruleMatches && matchedConditions.length > 0) {
        matches.push({
          rule_id: rule.id,
          rule_name: rule.name,
          target_index: rule.target_index,
          priority: rule.priority,
          matched_conditions: matchedConditions,
        });
      }
    }

    // Sort by priority (lowest first = highest priority)
    matches.sort((a, b) => a.priority - b.priority);

    return res.json({
      matched_rules: matches,
      target_index: matches.length > 0 ? matches[0].target_index : null,
    });
  } catch (error) {
    console.error('Error evaluating routing rules:', error);
    return res.status(500).json({ error: 'Failed to evaluate routing rules' });
  }
});

export default router;
