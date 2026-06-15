import { Router, Request, Response } from 'express';
import { generateText } from './shared.js';
import { ensureLlamaIndexReady, llamaQueryIndex } from './llamaindex.js';

const router = Router();

// =============================================================================
// AI ASSISTANT CHAT (for in-app help)
// =============================================================================

// Chat endpoint for in-app AI assistant
router.post('/assistant/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Try to use RAG with queryIndex (which works better than chatEngine)
    const llamaReady = await ensureLlamaIndexReady();
    let response: string;
    let sources: Array<{ title: string; score?: number }> = [];

    if (llamaReady) {
      // Use LlamaIndex query engine with system context
      const assistantContext = `You are the LogNog AI Assistant. Help the user with their question about LogNog - a self-hosted log management platform.
Be concise and practical. When suggesting DSL queries, explain what they do.

User question: ${message}`;

      const result = await llamaQueryIndex({
        query: assistantContext,
        topK: 3,
        useReasoning: false, // use fast model for assistant
      });
      response = result.response;
      sources = result.sourceNodes.map(node => ({
        title: node.metadata?.title as string || 'Unknown',
        score: node.score,
      }));
    } else {
      // Fallback to direct generation
      const systemPrompt = `You are the LogNog AI Assistant, a helpful guide for LogNog - a self-hosted log management platform.
Help users write DSL queries, explain features, troubleshoot issues, and guide setup.
Be concise and practical.`;

      const genResult = await generateText(
        `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`,
        { useReasoning: false }
      );
      response = genResult.response;
    }

    return res.json({
      response,
      sources,
      source: llamaReady ? 'llamaindex' : 'direct',
    });
  } catch (error) {
    console.error('Error in assistant chat:', error);
    return res.status(500).json({ error: 'Failed to process message' });
  }
});

export default router;
