// Quality gate for LLM-written copy. Cheap, deterministic, and applied at
// three layers: writer output, scout candidates and the moment before
// publish — on a small account every bad post costs double.

const FOREIGN = /[一-鿿぀-ヿ가-힯Ѐ-ӿ؀-ۿ]/;
const DESCRIPTIVE = /^v[íi]deo\b|^assista\b|^veja o v[íi]deo/i;

/** Returns {ok, motivo}. Checks headline and (optionally) caption. */
export function checkCopy({headline, caption}) {
  const h = (headline ?? '').trim();
  if (!h) return {ok: false, motivo: 'manchete vazia'};
  if (FOREIGN.test(h)) return {ok: false, motivo: 'manchete em idioma estrangeiro (CJK/cirílico/árabe)'};
  if (DESCRIPTIVE.test(h)) return {ok: false, motivo: `manchete descritiva ("${h.slice(0, 30)}...")`};
  if (h.length > 110) return {ok: false, motivo: `manchete longa demais (${h.length} chars)`};
  if (h === h.toUpperCase() && h.length > 20) return {ok: false, motivo: 'manchete toda em caixa alta'};
  const c = (caption ?? '').trim();
  if (c && FOREIGN.test(c)) return {ok: false, motivo: 'caption em idioma estrangeiro'};
  return {ok: true, motivo: null};
}
