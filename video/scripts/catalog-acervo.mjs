// Catalogs processed stickers with the vision model: semantic name, editorial
// concepts (what beats it fits), energy and license risk. Output feeds the
// beat generator's prop picker. Usage: node scripts/catalog-acervo.mjs <dir>
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {chatCompletion, parseJsonBlock} from './llm.mjs';

const dir = process.argv[2] ?? 'out/acervo';
const files = readdirSync(dir).filter((f) => f.startsWith('prop-') && f.endsWith('.png')).sort();
const catalog = [];
for (const f of files) {
  try {
    const small = await sharp(readFileSync(join(dir, f))).flatten({background: '#666666'}).resize(320, 320, {fit: 'inside'}).jpeg({quality: 75}).toBuffer();
    const text = await chatCompletion({
      model: 'google/gemini-2.5-flash-lite',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {type: 'text', text: `Sticker de colagem para vídeos de notícias de IA/tech. Responda SÓ JSON:
{"nome": "kebab-case curto do que É (ex: maos-rezando, boca-grito)",
 "descricao": "1 frase",
 "conceitos": ["3-6 tags de PAUTA onde ele encaixa: seguranca, vazamento, polemica, ia, dinheiro, velocidade, esperanca, acordo, falha, viral, midia, privacidade, etc"],
 "energia": "positiva|negativa|neutra|alerta",
 "texto": "texto escrito no sticker, ou null",
 "risco": "nenhum|celebridade|obra-protegida|marca"}`},
          {type: 'image_url', image_url: {url: 'data:image/jpeg;base64,' + small.toString('base64')}},
        ],
      }],
    });
    const meta = parseJsonBlock(text);
    catalog.push({arquivo: f, ...meta});
    console.log(`${f}: ${meta.nome} [${(meta.conceitos ?? []).join(',')}] risco=${meta.risco}`);
  } catch (err) {
    console.log(`${f}: falhou (${String(err).slice(0, 60)})`);
  }
}
writeFileSync(join(dir, 'catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`catalogo: ${catalog.length} itens`);
