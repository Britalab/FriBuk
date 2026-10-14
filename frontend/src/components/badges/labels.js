// Nombre con su nivel o su mes: "Autor Constante II", "Autor Popular (oct 2026)".
export function badgeLabel(badge) {
  if (badge.period) return `${badge.name} (${badge.period})`;
  return badge.level_label ? `${badge.name} ${badge.level_label}` : badge.name;
}
