// VLM screening for candidate card images: what does each photo show, and
// does it contain an identifiable person? The writer uses these notes to
// pair images with cards — and to keep people away from claims that are
// not about them. Conservative on failure: an unreadable image is treated
// as "identifiable person, unknown" so it never gets paired.
import sharp from 'sharp';
import {envValue} from './tts.mjs';

const VISION_MODEL = () => envValue('OPENSOCIAL_VISION_MODEL') ?? 'google/gemini-2.5-flash-lite';

const PROMPT = `Descreva a imagem para uso editorial. Responda SÓ com JSON:
{"descricao": "uma frase objetiva do que a imagem mostra",
 "pessoa_identificavel": true/false,
 "quem": "nome da pessoa se for pública e reconhecível, senão null"}`;

async function describeOne(url, apiKey) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`imagem ${res.status}`);
  const small = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(512, 512, {fit: 'inside', withoutEnlargement: true})
    .jpeg({quality: 80})
    .toBuffer();
  const api = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {authorization: `Bearer ${apiKey}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      model: VISION_MODEL(),
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            {type: 'text', text: PROMPT},
            {type: 'image_url', image_url: {url: `data:image/jpeg;base64,${small.toString('base64')}`}},
          ],
        },
      ],
    }),
  });
  if (!api.ok) throw new Error(`gateway ${api.status}`);
  const data = await api.json();
  const text = (data.choices?.[0]?.message?.content ?? '').replace(/```(?:json)?/g, '');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

/** Returns [{index, descricao, pessoa_identificavel, quem}] for up to 6 images. */
export async function describeImages(images, apiKey) {
  const out = [];
  for (const [index, img] of images.slice(0, 6).entries()) {
    try {
      const d = await describeOne(img.url, apiKey);
      out.push({
        index,
        descricao: d.descricao ?? '(sem descrição)',
        pessoa_identificavel: Boolean(d.pessoa_identificavel),
        quem: d.quem ?? null,
      });
    } catch (err) {
      console.error(`vision: imagem ${index} ilegível (${err.message}) — tratada como pessoa não identificada`);
      out.push({index, descricao: '(ilegível)', pessoa_identificavel: true, quem: null});
    }
  }
  return out;
}
