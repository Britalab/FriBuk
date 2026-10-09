import { contentWarningGroups } from "../../utils/contentWarnings";

const CHOICES = [
  { value: false, label: "No" },
  { value: true, label: "Sí" },
];

// Campos del aviso de contenido sensible, compartidos por crear y editar
// historia. Con "No" las advertencias se ocultan y se vacían.
export default function ContentWarningFields({
  sensitive,
  warnings,
  onSensitiveChange,
  onWarningsChange,
}) {
  const toggleWarning = (value) => {
    onWarningsChange(
      warnings.includes(value)
        ? warnings.filter((warning) => warning !== value)
        : [...warnings, value]
    );
  };

  return (
    <>
      <div className="form-group">
        <span className="form-choice-label" id="sensitive-content-label">
          ¿Esta historia contiene contenido sensible?
        </span>

        <div
          className="form-choice"
          role="radiogroup"
          aria-labelledby="sensitive-content-label"
        >
          {CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              role="radio"
              aria-checked={sensitive === choice.value}
              className={`form-choice-option${
                sensitive === choice.value ? " selected" : ""
              }`}
              onClick={() => {
                onSensitiveChange(choice.value);
                if (!choice.value) onWarningsChange([]);
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>

        <p className="form-help">
          Es solo un aviso para quienes lean tu historia.
        </p>
      </div>

      {sensitive && (
        <div className="form-group">
          <div className="form-label-row">
            <span className="form-choice-label" id="content-warnings-label">
              Advertencias de contenido
            </span>

            <span className="form-optional">Opcional</span>
          </div>

          <p className="form-help">
            Marca todas las que correspondan. Ayudan a cada persona a decidir
            si quiere leer tu historia.
          </p>

          <div
            className="content-warning-groups"
            role="group"
            aria-labelledby="content-warnings-label"
          >
            {contentWarningGroups(warnings).map((group) => (
              <div
                className="content-warning-group"
                role="group"
                aria-label={group.title}
                key={group.title}
              >
                <span className="content-warning-group-title">
                  {group.title}
                </span>

                <div className="story-tags">
                  {group.warnings.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={`story-tag${
                        warnings.includes(value) ? " selected" : ""
                      }`}
                      aria-pressed={warnings.includes(value)}
                      onClick={() => toggleWarning(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
