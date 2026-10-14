// Nombre con su nivel: "Autor Constante II".
export function badgeLabel(badge) {
  return badge.level_label ? `${badge.name} ${badge.level_label}` : badge.name;
}
