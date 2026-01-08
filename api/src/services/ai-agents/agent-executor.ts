/**
 * AI Agent Executor
 *
 * Handles the agent conversation loop with tool calling support.
 * Works with both Ollama (local) and OpenRouter (cloud) LLMs.
 */

import { executeTool, getToolsForLLM, AGENT_TOOLS, type ToolResult } from './tools.js';
import { getPersona, getDefaultPersona, type AgentPersona } from './personas.js';
import {
  getAgentConversation,
  createAgentConversation,
  addAgentMessage,
  updateConversationTitle,
  getSystemSetting,
  type AgentConversation,
  type AgentMessage,
} from '../../db/sqlite.js';

// Dynamic configuration getters - read from database first, then env, then defaults
function getOllamaUrl(): string {
  return getSystemSetting('ai_ollama_url') || process.env.OLLAMA_URL || 'http://localhost:11434';
}
function getOllamaAgentModel(): string {
  return getSystemSetting('ai_ollama_agent_model') || process.env.OLLAMA_AGENT_MODEL || getSystemSetting('ai_ollama_model') || process.env.OLLAMA_MODEL || 'llama3.2';
}
function getOpenRouterApiKey(): string | undefined {
  return getSystemSetting('ai_openrouter_api_key') || process.env.OPENROUTER_API_KEY || undefined;
}
function getOpenRouterModel(): string {
  return getSystemSetting('ai_openrouter_model') || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
}

// OpenRouter API endpoint (constant)
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MAX_TOOL_ITERATIONS = 10;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface AgentResponse {
  message: string;
  toolCalls: Array<{
    tool: string;
    parameters: Record<string, unknown>;
    result: ToolResult;
  }>;
  conversationId: string;
  messageId: string;
  thinking?: string;
}

// Check if Ollama is available
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getOllamaUrl()}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Call OpenRouter API with function calling
async function callOpenRouter(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }>
): Promise<{
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}> {
  if (!getOpenRouterApiKey()) {
    throw new Error('OpenRouter API key not configured');
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getOpenRouterApiKey()}`,
      'HTTP-Referer': 'https://lognog.local',
      'X-Title': 'LogNog AI Agent',
    },
    body: JSON.stringify({
      model: getOpenRouterModel(),
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
  const choice = data.choices?.[0]?.message;

  return {
    content: choice?.content || null,
    tool_calls: choice?.tool_calls,
  };
}

// Call Ollama API (with simulated function calling for models that support it)
async function callOllama(
  messages: ChatMessage[],
  persona: AgentPersona
): Promise<{
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}> {
  // For Ollama, we'll use a structured prompt approach for tool calling
  const availableTools = AGENT_TOOLS.filter(t => persona.tools.includes(t.name));

  const toolDescriptions = availableTools.map(t =>
    `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters.properties, null, 2)}`
  ).join('\n\n');

  const systemMessage = `${persona.systemPrompt}

You have access to the following tools:

${toolDescriptions}

When you need to use a tool, respond with a JSON object in this exact format:
\`\`\`tool
{"tool": "tool_name", "parameters": {...}}
\`\`\`

You can use multiple tools by including multiple tool blocks. After receiving tool results, analyze them and provide your response.

If you don't need to use any tools, just respond normally with your analysis or answer.`;

  const ollamaMessages = [
    { role: 'system', content: systemMessage },
    ...messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.role === 'tool'
        ? `Tool result for ${m.name}:\n${m.content}`
        : m.content,
    })),
  ];

  const response = await fetch(`${getOllamaUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getOllamaAgentModel(),
      messages: ollamaMessages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${error}`);
  }

  const data = await response.json() as {
    message?: { content?: string };
  };
  const content = data.message?.content || '';

  // Parse tool calls from the response
  const toolCallRegex = /```tool\s*\n?([\s\S]*?)```/g;
  const toolCalls: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }> = [];

  let match;
  let cleanContent = content;

  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const toolJson = JSON.parse(match[1].trim());
      toolCalls.push({
        id: `call_${Date.now()}_${toolCalls.length}`,
        type: 'function',
        function: {
          name: toolJson.tool,
          arguments: JSON.stringify(toolJson.parameters || {}),
        },
      });
      cleanContent = cleanContent.replace(match[0], '').trim();
    } catch {
      // Invalid JSON, skip this match
    }
  }

  return {
    content: cleanContent || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

// Execute the agent loop
export async function executeAgent(
  userMessage: string,
  conversationId?: string,
  personaId?: string
): Promise<AgentResponse> {
  const persona = personaId ? getPersona(personaId) || getDefaultPersona() : getDefaultPersona();

  // Get or create conversation
  let conversation: AgentConversation | undefined;

  if (conversationId) {
    conversation = getAgentConversation(conversationId) || undefined;
  }

  if (!conversation) {
    conversation = createAgentConversation({
      persona_id: persona.id,
      title: userMessage.slice(0, 100),
    });
    conversationId = conversation.id;
  }

  // Add user message
  addAgentMessage({
    conversation_id: conversationId!,
    role: 'user',
    content: userMessage,
  });

  // Build messages array from conversation history
  const messages: ChatMessage[] = [
    { role: 'system', content: persona.systemPrompt },
  ];

  // Add previous messages from conversation
  const previousMessages = conversation.messages || [];
  for (const msg of previousMessages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : undefined,
      });
    }
  }

  // Add the current user message
  messages.push({ role: 'user', content: userMessage });

  // Determine which LLM to use
  const useOllama = await isOllamaAvailable();

  // Get tools for this persona
  const tools = getToolsForLLM().filter(t =>
    persona.tools.includes(t.function.name)
  );

  // Agent loop
  const allToolCalls: AgentResponse['toolCalls'] = [];
  let iterations = 0;
  let finalResponse = '';

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    // Call LLM
    let llmResponse;

    if (useOllama) {
      llmResponse = await callOllama(messages, persona);
    } else {
      llmResponse = await callOpenRouter(messages, tools);
    }

    // Check if there are tool calls
    if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: llmResponse.content || '',
        tool_calls: llmResponse.tool_calls,
      });

      // Execute each tool call
      for (const toolCall of llmResponse.tool_calls) {
        const toolName = toolCall.function.name;
        let parameters: Record<string, unknown>;

        try {
          parameters = JSON.parse(toolCall.function.arguments);
        } catch {
          parameters = {};
        }

        // Check if this tool is allowed for the persona
        if (!persona.tools.includes(toolName)) {
          const result: ToolResult = {
            success: false,
            error: `Tool ${toolName} is not available for this persona`,
          };

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify(result),
          });

          allToolCalls.push({ tool: toolName, parameters, result });
          continue;
        }

        // Execute the tool
        const result = await executeTool(toolName, parameters);

        // Add tool result to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(result),
        });

        allToolCalls.push({ tool: toolName, parameters, result });
      }
    } else {
      // No tool calls, we have the final response
      finalResponse = llmResponse.content || 'I apologize, but I was unable to generate a response.';
      break;
    }
  }

  if (iterations >= MAX_TOOL_ITERATIONS && !finalResponse) {
    finalResponse = 'I reached the maximum number of tool calls. Here is what I found so far based on my investigation.';
  }

  // Save assistant response
  const assistantMessage = addAgentMessage({
    conversation_id: conversationId!,
    role: 'assistant',
    content: finalResponse,
    tool_calls: allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : undefined,
  });

  // Update conversation title if this is the first exchange
  if (previousMessages.length === 0) {
    // Generate a title from the first message
    const title = userMessage.length > 50
      ? userMessage.slice(0, 50) + '...'
      : userMessage;
    updateConversationTitle(conversationId!, title);
  }

  return {
    message: finalResponse,
    toolCalls: allToolCalls,
    conversationId: conversationId!,
    messageId: assistantMessage.id,
  };
}

// Stream agent response (for real-time updates)
export async function* streamAgent(
  userMessage: string,
  conversationId?: string,
  personaId?: string
): AsyncGenerator<{
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message' | 'done';
  data: unknown;
}> {
  const persona = personaId ? getPersona(personaId) || getDefaultPersona() : getDefaultPersona();

  yield { type: 'thinking', data: { persona: persona.name } };

  try {
    const response = await executeAgent(userMessage, conversationId, personaId);

    // Yield tool calls
    for (const toolCall of response.toolCalls) {
      yield {
        type: 'tool_call',
        data: { tool: toolCall.tool, parameters: toolCall.parameters }
      };
      yield {
        type: 'tool_result',
        data: { tool: toolCall.tool, result: toolCall.result }
      };
    }

    // Yield final message
    yield { type: 'message', data: { content: response.message } };
    yield {
      type: 'done',
      data: {
        conversationId: response.conversationId,
        messageId: response.messageId,
      }
    };
  } catch (error) {
    yield {
      type: 'message',
      data: {
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: true,
      }
    };
    yield { type: 'done', data: {} };
  }
}
