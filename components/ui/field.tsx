"use client";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

type FieldShellProps = {
  label: string;
  helper?: ReactNode;
  error?: string | null;
  required?: boolean;
  counter?: { value: number; max: number };
  children: (ids: { inputId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
};

export function FieldShell({ label, helper, error, required, counter, children }: FieldShellProps) {
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const counterId = `${inputId}-counter`;
  const describedBy = [helper ? helperId : null, error ? errorId : null, counter ? counterId : null]
    .filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger" aria-hidden> *</span> : null}
        {required ? <span className="sr-only"> (обязательное поле)</span> : null}
      </label>
      {children({ inputId, describedBy, invalid: Boolean(error) })}
      <div className="flex items-start justify-between gap-3 text-xs">
        <div className="flex flex-col gap-0.5">
          {helper ? <p id={helperId} className="text-muted-foreground">{helper}</p> : null}
          {error ? <p id={errorId} className="font-medium text-danger" role="alert">{error}</p> : null}
        </div>
        {counter ? (
          <p id={counterId} className={cn("tabular-nums text-muted-foreground", counter.value > counter.max && "text-danger")}>
            {counter.value} / {counter.max}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground "
  + "placeholder:text-muted-foreground read-only:bg-muted disabled:cursor-not-allowed disabled:opacity-60 "
  + "aria-[invalid=true]:border-danger";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string; helper?: ReactNode; error?: string | null;
};
export function TextField({ label, helper, error, required, className, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} helper={helper} error={error} required={required}>
      {({ inputId, describedBy, invalid }) => (
        <input id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined}
          required={required} className={cn(inputClass, "min-h-11", className)} {...rest} />
      )}
    </FieldShell>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string; helper?: ReactNode; error?: string | null; maxChars?: number;
};
export function TextArea({ label, helper, error, required, maxChars, className, value, ...rest }: TextAreaProps) {
  const length = typeof value === "string" ? value.length : 0;
  return (
    <FieldShell label={label} helper={helper} error={error} required={required}
      counter={maxChars ? { value: length, max: maxChars } : undefined}>
      {({ inputId, describedBy, invalid }) => (
        <textarea id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined}
          required={required} value={value} className={cn(inputClass, "min-h-32 py-2 leading-relaxed", className)} {...rest} />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string; helper?: ReactNode; error?: string | null;
  options: { value: string; label: string }[];
};
export function SelectField({ label, helper, error, required, options, className, ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} helper={helper} error={error} required={required}>
      {({ inputId, describedBy, invalid }) => (
        <select id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined}
          required={required} className={cn(inputClass, "min-h-11", className)} {...rest}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </FieldShell>
  );
}
