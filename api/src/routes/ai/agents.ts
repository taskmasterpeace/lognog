import { Router, Request, Response } from 'express';
import { executeAgent, streamAgent } from '../../services/ai-agents/agent-executor.js';
import { AGENT_PERSONAS, getPersona } from '../../services/ai-agents/personas.js';
import { AGENT_TOOLS } from '../../services/ai-agents/tools.js';
import {
  getAgentConversations,
  getAgentConversation,
  deleteAgentConversation,
} from '../../db/sqlite.js';

const router = Router();

// Get available agent personas
router.get('/agents/personas', (_req: Request, res: Response) => {
  return res.json({
    personas: AGENT_PERSONAS.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon,
      tools: p.tools,
      examples: p.examples,
    })),
  });
});

// Get available tools
router.get('/agents/tools', (_req: Request, res: Response) => {
  return res.json({
    tools: AGENT_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  });
});

// Get persona details
router.get('/agents/personas/:id', (req: Request, res: Response) => {
  const persona = getPersona(req.params.id);
  if (!persona) {
    return res.status(404).json({ error: 'Persona not found' });
  }
  return res.json(persona);
});

// List agent conversations
router.get('/agents/conversations', (req: Request, res: Response) => {
  try {
    const { persona_id, limit } = req.query;
    const conversations = getAgentConversations({
      persona_id: persona_id as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    return res.json({ conversations });
  } catch (error) {
    console.error('Error listing conversations:', error);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Get conversation with messages
router.get('/agents/conversations/:id', (req: Request, res: Response) => {
  try {
    const conversation = getAgentConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json(conversation);
  } catch (error) {
    console.error('Error getting conversation:', error);
    return res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Delete conversation
router.delete('/agents/conversations/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteAgentConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json({ message: 'Conversation deleted' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Chat with agent
router.post('/agents/chat', async (req: Request, res: Response) => {
  try {
    const { message, conversation_id, persona_id } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await executeAgent(message, conversation_id, persona_id);

    return res.json({
      message: response.message,
      toolCalls: response.toolCalls,
      conversationId: response.conversationId,
      messageId: response.messageId,
    });
  } catch (error) {
    console.error('Error in agent chat:', error);
    return res.status(500).json({ error: 'Failed to process agent chat' });
  }
});

// Stream agent response (Server-Sent Events)
router.get('/agents/chat/stream', async (req: Request, res: Response) => {
  try {
    const { message, conversation_id, persona_id } = req.query;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream = streamAgent(
      message as string,
      conversation_id as string | undefined,
      persona_id as string | undefined
    );

    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error in agent stream:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: { message: 'Stream failed' } })}\n\n`);
    res.end();
  }
});

export default router;
