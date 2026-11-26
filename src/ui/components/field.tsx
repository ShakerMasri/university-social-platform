import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertIcon, ChevronDownIcon } from "../icons";
import { classNames } from "../class-names";
import styles from "./field.module.css";

type FieldFrameProps = {
  label: string;
  /** Hide the label visually; it stays the accessible name. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

/** Ids and ARIA wiring shared by every labelled control. */
function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return { controlId, hintId, errorId, describedBy };
}

function FieldFrame({ label, hideLabel, hint, error, required, controlId, hintId, errorId, children }: FieldFrameProps & {
  controlId: string; hintId?: string; errorId?: string; children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={controlId} className={classNames(styles.label, hideLabel && "ui-visually-hidden")}>
        {label}
        {required && <span className={styles.requiredMark} aria-hidden="true">*</span>}
      </label>
      {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
      {children}
      {error && (
        <p id={errorId} className={styles.error}>
          <AlertIcon size={16} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

type TextInputProps = FieldFrameProps & Omit<InputHTMLAttributes<HTMLInputElement>, "required"> & { multiline?: false };
type TextAreaProps = FieldFrameProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "required"> & { multiline: true };
export type TextFieldProps = TextInputProps | TextAreaProps;

/**
 * A labelled text input or textarea. The hint and error are linked with
 * aria-describedby, and an error sets aria-invalid. Required fields show a
 * visual asterisk; the native required attribute announces it.
 */
export function TextField(props: TextFieldProps) {
  const { label, hideLabel, hint, error, required, id, className } = props;
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);
  const frame = { label, hideLabel, hint, error, required, controlId, hintId, errorId };
  const common = {
    id: controlId, required, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy,
  };

  if (props.multiline) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- frame props are not DOM attributes
    const { label: _l, hideLabel: _h, hint: _hi, error: _e, required: _r, multiline: _m, className: _c, ...rest } = props;
    return (
      <FieldFrame {...frame}>
        <textarea {...rest} {...common} className={classNames(styles.control, styles.multiline, className)} />
      </FieldFrame>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- frame props are not DOM attributes
  const { label: _l, hideLabel: _h, hint: _hi, error: _e, required: _r, multiline: _m, className: _c, type = "text", ...rest } = props;
  return (
    <FieldFrame {...frame}>
      <input {...rest} {...common} type={type} className={classNames(styles.control, className)} />
    </FieldFrame>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = FieldFrameProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "required" | "children"> & {
  options: readonly SelectOption[];
};

/** A labelled native select: native keyboard and screen reader support. */
export function Select({ label, hideLabel, hint, error, required, id, className, options, ...rest }: SelectProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);
  return (
    <FieldFrame {...{ label, hideLabel, hint, error, required, controlId, hintId, errorId }}>
      <div className={styles.selectWrap}>
        <select
          {...rest} id={controlId} required={required}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          className={classNames(styles.control, styles.select, className)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </select>
        <ChevronDownIcon className={styles.selectIcon} size={18} />
      </div>
    </FieldFrame>
  );
}
