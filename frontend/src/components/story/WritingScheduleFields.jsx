import { WEEK_DAYS, formatScheduleDays, formatScheduleHour } from "../../utils/writingSchedule";

const CHOICES = [
  { value: true, label: "Sí" },
  { value: false, label: "No" },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// Días de escritura de una historia: qué días y a qué hora llega el
// recordatorio, y si los lectores ven los días en la historia.
export default function WritingScheduleFields({ schedule, onChange }) {
  const { days, hour, showPublicly } = schedule;

  const toggleDay = (value) => {
    onChange({
      ...schedule,
      days: days.includes(value)
        ? days.filter((day) => day !== value)
        : [...days, value].sort((first, second) => first - second),
    });
  };

  return (
    <div className="form-group writing-schedule">
      <div className="form-label-row">
        <span className="form-choice-label" id="writing-days-label">
          ¿Quieres compartir los días de actualización?
        </span>

        <span className="form-optional">Opcional</span>
      </div>

      <p className="form-help">
        Elige los días en que quieres publicar. Esos días te avisaremos a la
        hora que elijas, salvo que ya hayas publicado un capítulo.
      </p>

      <div className="story-tags" role="group" aria-labelledby="writing-days-label">
        {WEEK_DAYS.map((day) => (
          <button
            key={day.value}
            type="button"
            className={`story-tag${days.includes(day.value) ? " selected" : ""}`}
            aria-pressed={days.includes(day.value)}
            aria-label={day.plural}
            onClick={() => toggleDay(day.value)}
          >
            {day.short}
          </button>
        ))}
      </div>

      {days.length > 0 && (
        <>
          <label className="writing-schedule-hour">
            <span>Hora del recordatorio</span>
            <select
              className="form-select"
              value={hour}
              onChange={(event) =>
                onChange({ ...schedule, hour: Number(event.target.value) })
              }
            >
              {HOURS.map((value) => (
                <option key={value} value={value}>
                  {formatScheduleHour(value)}
                </option>
              ))}
            </select>
          </label>

          <span className="form-choice-label" id="writing-days-public-label">
            ¿Mostrarlos en la página de tu historia?
          </span>

          <div
            className="form-choice"
            role="radiogroup"
            aria-labelledby="writing-days-public-label"
          >
            {CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                role="radio"
                aria-checked={showPublicly === choice.value}
                className={`form-choice-option${
                  showPublicly === choice.value ? " selected" : ""
                }`}
                onClick={() => onChange({ ...schedule, showPublicly: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>

          <p className="form-help">
            {showPublicly
              ? `En tu historia se verá: «📅 Nuevo capítulo ${formatScheduleDays(days)}».`
              : "Los días solo los verás tú."}{" "}
            Los recordatorios llegan mientras la historia esté Publicada.
          </p>
        </>
      )}
    </div>
  );
}
