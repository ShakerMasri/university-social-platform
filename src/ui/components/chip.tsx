import { useId, type ButtonHTMLAttributes, type ChangeEvent } from "react";
import { CheckIcon } from "../icons";
import { classNames } from "../class-names";
import styles from "./chip.module.css";

export type ChipTone = "neutral" | "question" | "discussion" | "resource" | "announcement";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  pressed: boolean;
  tone?: ChipTone;
};

/** A toggle chip (aria-pressed), for independent on/off filters. */
export function Chip({ pressed, tone = "neutral", className, children, type = "button", ...props }: ChipProps) {
  return (
    <button {...props} type={type} aria-pressed={pressed} className={classNames(styles.chip, tone !== "neutral" && styles[tone], className)}>
      <span className={styles.check}><CheckIcon size={16} /></span>
      {children}
    </button>
  );
}

export type ChoiceChipOption<Value extends string> = { value: Value; label: string; tone?: ChipTone; disabled?: boolean };

export type ChoiceChipsProps<Value extends string> = {
  legend: string;
  hideLegend?: boolean;
  name: string;
  options: readonly ChoiceChipOption<Value>[];
  /** Controlled value with onChange, or defaultValue for an uncontrolled form field. */
  value?: Value;
  defaultValue?: Value;
  onChange?: (value: Value) => void;
  required?: boolean;
};

/**
 * Single choice shown as chips: a fieldset of native radio buttons, so arrow
 * keys move between options and the form submits the value without script.
 */
export function ChoiceChips<Value extends string>({ legend, hideLegend, name, options, value, defaultValue, onChange, required }: ChoiceChipsProps<Value>) {
  const groupId = useId();
  const change = onChange && ((event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value as Value));
  return (
    <fieldset className={styles.group}>
      <legend className={classNames(styles.legend, hideLegend && "ui-visually-hidden")}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => {
          const id = `${groupId}-${option.value}`;
          return (
            <span key={option.value} className={styles.choice}>
              <input
                type="radio" id={id} name={name} value={option.value} required={required} disabled={option.disabled}
                {...(value !== undefined ? { checked: value === option.value, onChange: change } : { defaultChecked: defaultValue === option.value })}
              />
              <label htmlFor={id} className={classNames(styles.chip, option.tone && option.tone !== "neutral" && styles[option.tone])}>
                <span className={styles.check}><CheckIcon size={16} /></span>
                {option.label}
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
