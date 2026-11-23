export type LlmConfig = { key: string; base: string; model: string };

/** OpenAI-compatible settings. Empty key means the canned assistant is used. */
export function llmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const key = env.AI_API_KEY || env.OPENAI_API_KEY || env.XAI_API_KEY || '';
  if (!key) return null;
  const xaiOnly = Boolean(env.XAI_API_KEY) && !env.AI_API_KEY && !env.OPENAI_API_KEY;
  const base = (env.AI_BASE_URL || (xaiOnly ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
  const model = env.AI_MODEL || (base.includes('api.x.ai') ? 'grok-3' : 'gpt-4o-mini');
  return { key, base, model };
}

export async function* streamChat(cfg: LlmConfig, system: string, user: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status} ${detail.slice(0, 200)}`);
  }
  if (!res.body) throw new Error('LLM stream missing');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* ignore keep-alives */
      }
    }
  }
}

export const AI_SYSTEM = `あなたは株式会社GIX（埼玉のAI動画プロダクション）の社内アシスタント「GIX AI」です。
日本語で、簡潔に、社内データの事実に基づいて答えてください。
データにない数値は作らないでください。Markdownで見出しと箇条書きを使ってください。
外部の公開情報ではなく、渡された社内コンテキストを優先します。`;
