import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

export interface InterviewSession {
  id: string;
  name: string;
  app_name?: string;
  team_name?: string;
  status: 'questionnaire_sent' | 'awaiting_response' | 'processing' | 'follow_up_sent' | 'implementation_ready' | 'completed';
  current_step: number;
  questionnaire?: string;
  responses?: string;
  follow_up_questions?: string;
  implementation_guide?: string;
  recommended_logs?: string;
  created_at: string;
  updated_at: string;
}

export function getInterviewSessions(): InterviewSession[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM interview_sessions ORDER BY updated_at DESC').all() as InterviewSession[];
}

export function getInterviewSession(id: string): InterviewSession | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id) as InterviewSession | undefined;
}

export function createInterviewSession(
  name: string,
  options: {
    app_name?: string;
    team_name?: string;
    questionnaire?: string;
  } = {}
): InterviewSession {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO interview_sessions (
      id, name, app_name, team_name, status, current_step, questionnaire
    ) VALUES (?, ?, ?, ?, 'questionnaire_sent', 1, ?)
  `).run(
    id,
    name,
    options.app_name || null,
    options.team_name || null,
    options.questionnaire || null
  );

  return getInterviewSession(id)!;
}

export function updateInterviewSession(
  id: string,
  updates: {
    name?: string;
    app_name?: string;
    team_name?: string;
    status?: InterviewSession['status'];
    current_step?: number;
    questionnaire?: string;
    responses?: string;
    follow_up_questions?: string;
    implementation_guide?: string;
    recommended_logs?: string;
  }
): InterviewSession | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.app_name !== undefined) {
    fields.push('app_name = ?');
    values.push(updates.app_name);
  }
  if (updates.team_name !== undefined) {
    fields.push('team_name = ?');
    values.push(updates.team_name);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.current_step !== undefined) {
    fields.push('current_step = ?');
    values.push(updates.current_step);
  }
  if (updates.questionnaire !== undefined) {
    fields.push('questionnaire = ?');
    values.push(updates.questionnaire);
  }
  if (updates.responses !== undefined) {
    fields.push('responses = ?');
    values.push(updates.responses);
  }
  if (updates.follow_up_questions !== undefined) {
    fields.push('follow_up_questions = ?');
    values.push(updates.follow_up_questions);
  }
  if (updates.implementation_guide !== undefined) {
    fields.push('implementation_guide = ?');
    values.push(updates.implementation_guide);
  }
  if (updates.recommended_logs !== undefined) {
    fields.push('recommended_logs = ?');
    values.push(updates.recommended_logs);
  }

  if (fields.length === 0) {
    return getInterviewSession(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE interview_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getInterviewSession(id);
}

export function deleteInterviewSession(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM interview_sessions WHERE id = ?').run(id);
  return result.changes > 0;
}
