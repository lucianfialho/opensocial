// Single door to the LLM provider (OpenAI-compatible chat completions).
// Provider is a .env decision, not a code one: OPENSOCIAL_LLM_BASE_URL
// overrides the base, OPENROUTER_API_KEY (or the legacy AI_GATEWAY_API_KEY)
// authenticates. Default provider: OpenRouter.
import {envValue} from './tts.mjs';

const base = () => envValue('OPENSOCIAL_LLM_BASE_URL') ?? 'https://openrouter.ai/api/v1';

export const llmKey = () => envValue('OPENROUTER_API_KEY') ?? envValue('AI_GATEWAY_API_KEY');

/** POSTs an OpenAI-style body; returns the assistant message text. Throws
 *  `gateway <status>` on any non-2xx so callers keep their retry logic. */
export async function chatCompletion(body, apiKey = llmKey()) {
  const res = await fetch(`${base()}/chat/completions`, {
    method: 'POST',
    headers: {authorization: `Bearer ${apiKey}`, 'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** Extracts the first {...} block, tolerating ``` fences around it. */
export function parseJsonBlock(text) {
  const t = text.replace(/```(?:json)?/g, '');
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}
