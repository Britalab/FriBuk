// Días de escritura de una historia. Los días van de 0 (lunes) a 6
// (domingo), igual que en el backend.

export const WEEK_DAYS = [
  { value: 0, short: "Lun", plural: "lunes" },
  { value: 1, short: "Mar", plural: "martes" },
  { value: 2, short: "Mié", plural: "miércoles" },
  { value: 3, short: "Jue", plural: "jueves" },
  { value: 4, short: "Vie", plural: "viernes" },
  { value: 5, short: "Sáb", plural: "sábados" },
  { value: 6, short: "Dom", plural: "domingos" },
];

export const DEFAULT_SCHEDULE_HOUR = 19;

// "los martes y sábados", "los lunes, miércoles y viernes", "todos los días".
export function formatScheduleDays(days) {
  const names = WEEK_DAYS
    .filter((day) => days?.includes(day.value))
    .map((day) => day.plural);

  if (names.length === 0) return "";
  if (names.length === WEEK_DAYS.length) return "todos los días";
  if (names.length === 1) return `los ${names[0]}`;
  return `los ${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

export function formatScheduleHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

// La zona horaria del navegador, para que el aviso llegue a la hora local
// del autor en cualquier país.
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago";
  } catch {
    return "America/Santiago";
  }
}
