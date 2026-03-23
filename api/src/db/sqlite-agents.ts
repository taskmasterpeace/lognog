import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

export interface AgentConversation {
  id: string;
  persona_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: AgentMessage[];
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: string;
  thinking?: string;
  created_at: string;
}

export function getAgentConversations(filters?: {
  persona_id?: string;
  limit?: number;
}): AgentConversation[] {
  const database = getSQLiteDB();

  let sql = 'SELECT * FROM agent_conversations WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.persona_id) {
    sql += ' AND persona_id = ?';
    params.push(filters.persona_id);
  }

  sql += ' ORDER BY updated_at DESC';

  if (filters?.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  return database.prepare(sql).all(...params) as AgentConversation[];
}

export function getAgentConversation(id: string): AgentConversation | null {
  const database = getSQLiteDB();

  const conversation = database.prepare(
    'SELECT * FROM agent_conversations WHERE id = ?'
  ).get(id) as AgentConversation | undefined;

  if (!conversation) {
    return null;
  }

  // Load messages
  const messages = database.prepare(
    'SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(id) as AgentMessage[];

  return {
    ...conversation,
    messages,
  };
}

export function createAgentConversation(data: {
  persona_id: string;
  title: string;
}): AgentConversation {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO agent_conversations (id, persona_id, title)
    VALUES (?, ?, ?)
  `).run(id, data.persona_id, data.title);

  return getAgentConversation(id)!;
}

export function updateConversationTitle(id: string, title: string): AgentConversation | null {
  const database = getSQLiteDB();

  database.prepare(`
    UPDATE agent_conversations
    SET title = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(title, id);

  return getAgentConversation(id);
}

export function deleteAgentConversation(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function addAgentMessage(data: {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: string;
  thinking?: string;
}): AgentMessage {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO agent_messages (id, conversation_id, role, content, tool_calls, thinking)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.conversation_id, data.role, data.content, data.tool_calls || null, data.thinking || null);

  // Update conversation's updated_at
  database.prepare(`
    UPDATE agent_conversations SET updated_at = datetime('now') WHERE id = ?
  `).run(data.conversation_id);

  return database.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id) as AgentMessage;
}

export function getConversationMessages(conversationId: string): AgentMessage[] {
  const database = getSQLiteDB();
  return database.prepare(
    'SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId) as AgentMessage[];
}
