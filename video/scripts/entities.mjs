// Entities of an event. Prefers the API's aggregated `entidades` (papel and
// mencoes computed server-side); until that ships, flattens claims[].entities
// and derives the same shape — anchor = most-mentioned across claims.
// `tipo` reality check: empresa/pessoa/produto/conceito/modelo. "conceito"
// mixes ideas ("data centers") with mistyped orgs ("Citizen Lab"), so visual
// features (logos, face rules) only trust empresa and pessoa.

export function eventEntities(detail) {
  if (Array.isArray(detail.entidades)) return detail.entidades;
  const seen = new Map();
  for (const claim of detail.claims ?? []) {
    for (const e of claim.entities ?? []) {
      const cur = seen.get(e.slug) ?? {...e, mencoes: 0};
      cur.mencoes += 1;
      seen.set(e.slug, cur);
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.mencoes - a.mencoes)
    .map((e, i) => ({...e, papel: i === 0 ? 'principal' : 'citada'}));
}

/** Only the entity types safe to drive visuals (logo chips, face rules). */
export const visualEntities = (detail) =>
  eventEntities(detail).filter((e) => e.tipo === 'empresa' || e.tipo === 'pessoa');
