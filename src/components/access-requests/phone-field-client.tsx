"use client";

import { useState } from "react";
import PhoneInput from "react-phone-number-input";

import "react-phone-number-input/style.css";

// The stored value is whatever the input produces: E.164 ("+5491122334455").
// sanitizePhone strips it to digits wherever WhatsApp needs them.
export function PhoneFieldClient({
  name,
  defaultValue,
  required = true,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const [value, setValue] = useState<string | undefined>(
    defaultValue ?? undefined,
  );

  return (
    <PhoneInput
      name={name}
      international
      defaultCountry="AR"
      value={value}
      onChange={setValue}
      required={required}
      placeholder="11 2233 4455"
      numberInputProps={{
        className:
          "w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-4 focus:ring-[rgba(230,18,56,0.08)]",
      }}
      className="flex items-center gap-3"
    />
  );
}
