"use client";

import { useState } from "react";
import PhoneInput from "react-phone-number-input";

import "react-phone-number-input/style.css";

// PhoneInput forwards `name` to its own visible input, which carries the
// national-formatted text ("11 2233 4455"). The form needs the E.164 value, so
// the visible input stays unnamed and a hidden field carries `value` — that is
// what the action validates and what `sanitizePhone` later strips for WhatsApp.
export function PhoneFieldClient({
  id,
  name,
  defaultValue,
  required = true,
}: {
  id?: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const [value, setValue] = useState<string | undefined>(
    defaultValue ?? undefined,
  );

  return (
    <>
      <input type="hidden" name={name} value={value ?? ""} />
      <PhoneInput
        international
        defaultCountry="AR"
        value={value}
        onChange={setValue}
        required={required}
        placeholder="11 2233 4455"
        numberInputProps={{
          id,
          className:
            "w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-4 focus:ring-[rgba(230,18,56,0.08)]",
        }}
        className="flex items-center gap-3"
      />
    </>
  );
}
