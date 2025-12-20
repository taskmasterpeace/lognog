# Team Ollama Access Guide

Access the shared Ollama server with DeepSeek, Qwen, and embedding models.

---

## Server Info

| | Local Network | Tailscale |
|---|---|---|
| **URL** | `http://192.168.1.211:11434` | `http://100.120.206.8:11434` |
| **Port** | 11434 | 11434 |

---

## Available Models

| Model | Size | Best For | Speed |
|-------|------|----------|-------|
| `deepseek-coder-v2:16b` | 8.9 GB | Coding, debugging, code review | Fast |
| `qwen3:30b` | 18.5 GB | Reasoning, planning, analysis | Medium |
| `nomic-embed-text` | 274 MB | Embeddings for RAG | Very Fast |

---

## Quick Test

Open terminal and run:

```bash
curl http://192.168.1.211:11434/api/tags
```

Should return list of models.

---

## Usage Examples

### Chat Completion (cURL)

```bash
curl http://192.168.1.211:11434/api/chat -d '{
  "model": "deepseek-coder-v2:16b",
  "messages": [{"role": "user", "content": "Write a Python function to reverse a string"}],
  "stream": false
}'
```

### Generate (Simple)

```bash
curl http://192.168.1.211:11434/api/generate -d '{
  "model": "qwen3:30b",
  "prompt": "Explain Docker in 3 sentences",
  "stream": false
}'
```

### Embeddings

```bash
curl http://192.168.1.211:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "Hello world"
}'
```

---

## Python Integration

### Install

```bash
pip install ollama
```

### Basic Usage

```python
import ollama

# Set the host
client = ollama.Client(host='http://192.168.1.211:11434')

# Chat
response = client.chat(
    model='deepseek-coder-v2:16b',
    messages=[{'role': 'user', 'content': 'Write a hello world in Rust'}]
)
print(response['message']['content'])
```

### Streaming

```python
import ollama

client = ollama.Client(host='http://192.168.1.211:11434')

for chunk in client.chat(
    model='qwen3:30b',
    messages=[{'role': 'user', 'content': 'What is machine learning?'}],
    stream=True
):
    print(chunk['message']['content'], end='', flush=True)
```

### Embeddings for RAG

```python
import ollama

client = ollama.Client(host='http://192.168.1.211:11434')

response = client.embeddings(
    model='nomic-embed-text',
    prompt='Your text to embed'
)
embedding = response['embedding']  # 768-dimensional vector
```

---

## JavaScript/TypeScript Integration

### Install

```bash
npm install ollama
```

### Usage

```typescript
import { Ollama } from 'ollama';

const ollama = new Ollama({ host: 'http://192.168.1.211:11434' });

// Chat
const response = await ollama.chat({
  model: 'deepseek-coder-v2:16b',
  messages: [{ role: 'user', content: 'Write a React component for a button' }],
});
console.log(response.message.content);

// Streaming
for await (const chunk of await ollama.chat({
  model: 'qwen3:30b',
  messages: [{ role: 'user', content: 'Explain async/await' }],
  stream: true,
})) {
  process.stdout.write(chunk.message.content);
}
```

---

## LangChain Integration

### Python

```python
from langchain_community.llms import Ollama

llm = Ollama(
    base_url="http://192.168.1.211:11434",
    model="deepseek-coder-v2:16b"
)

response = llm.invoke("Write a SQL query to find duplicate emails")
print(response)
```

### Embeddings with LangChain

```python
from langchain_community.embeddings import OllamaEmbeddings

embeddings = OllamaEmbeddings(
    base_url="http://192.168.1.211:11434",
    model="nomic-embed-text"
)

vector = embeddings.embed_query("Your text here")
```

---

## OpenAI-Compatible API

Ollama supports OpenAI's API format:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://192.168.1.211:11434/v1",
    api_key="not-needed"  # Ollama doesn't require a key
)

response = client.chat.completions.create(
    model="deepseek-coder-v2:16b",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

This means any app that works with OpenAI can use our Ollama server - just change the base URL.

---

## VS Code / Cursor / Continue.dev

### Continue.dev Extension

1. Install Continue extension in VS Code
2. Open settings: `~/.continue/config.json`
3. Add:

```json
{
  "models": [
    {
      "title": "DeepSeek Coder (Team Server)",
      "provider": "ollama",
      "model": "deepseek-coder-v2:16b",
      "apiBase": "http://192.168.1.211:11434"
    },
    {
      "title": "Qwen 30B (Team Server)",
      "provider": "ollama",
      "model": "qwen3:30b",
      "apiBase": "http://192.168.1.211:11434"
    }
  ]
}
```

### Cursor

In Cursor settings, add custom model:
- API Base: `http://192.168.1.211:11434/v1`
- Model: `deepseek-coder-v2:16b`

---

## Environment Variables

Add to your `.env` or shell profile:

```bash
export OLLAMA_HOST=http://192.168.1.211:11434
```

Then you can use `ollama` CLI from any machine:

```bash
OLLAMA_HOST=http://192.168.1.211:11434 ollama run deepseek-coder-v2:16b
```

---

## Model Recommendations

| Task | Use This Model |
|------|----------------|
| Writing code | `deepseek-coder-v2:16b` |
| Code review | `deepseek-coder-v2:16b` |
| Debugging | `deepseek-coder-v2:16b` |
| Planning/architecture | `qwen3:30b` |
| Complex reasoning | `qwen3:30b` |
| Documentation | `qwen3:30b` |
| RAG/Search | `nomic-embed-text` |

---

## Troubleshooting

### "Connection refused"
- Is the server running? Check with owner
- Are you on the same network?
- Try Tailscale IP if on VPN

### Slow responses
- Large models (qwen3:30b) take longer
- If someone else is using it, responses queue up
- Try deepseek-coder for faster responses

### "Model not found"
- Check model name spelling
- Run `curl http://192.168.1.211:11434/api/tags` to see available models

---

## Server Status

Check if server is up:

```bash
curl http://192.168.1.211:11434/api/tags
```

Check what's running:

```bash
curl http://192.168.1.211:11434/api/ps
```

---

## Questions?

Contact the server owner if you need:
- Different models installed
- Higher priority access
- Help with integration
