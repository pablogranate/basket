"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ACCESS_REQUEST_COUNTRIES,
  countryFlag,
  findAccessRequestCountry,
  OTHER_CITY,
  splitAccessRequestCiudad,
} from "@/lib/access-requests/locations";

const LABEL_CLASS =
  "text-xs font-black uppercase tracking-[0.18em] text-[var(--n-500)]";

// Country first, then that country's cities. Changing the country resets the
// city so a Uruguayan city can never travel with an Argentine code; the action
// re-checks the pair anyway. `optional` (the /people editor) lets the city stay
// empty: a ficha without a city is fine, an applicant without one is not.
export function CiudadFieldClient({
  id,
  defaultValue,
  optional = false,
  disabled = false,
  labelClassName = LABEL_CLASS,
  fieldClassName,
}: {
  id: string;
  // A stored "Ciudad, País" to start from.
  defaultValue?: string | null;
  optional?: boolean;
  disabled?: boolean;
  labelClassName?: string;
  fieldClassName?: string;
}) {
  // A city typed before the picker existed ("Córdoba", no country) starts as
  // "Otra ciudad…" with its text, so saving the ficha never drops it unseen.
  const [initial] = useState(
    () =>
      splitAccessRequestCiudad(defaultValue) ??
      (defaultValue?.trim()
        ? { pais: "AR", ciudad: OTHER_CITY, otraCiudad: defaultValue.trim() }
        : null),
  );
  const [pais, setPais] = useState(initial?.pais ?? "AR");
  const [ciudad, setCiudad] = useState(initial?.ciudad ?? "");
  const country = findAccessRequestCountry(pais);

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-pais`} className={labelClassName}>
          País
        </label>
        <Select
          id={`${id}-pais`}
          name="pais"
          required
          disabled={disabled}
          className={fieldClassName}
          value={pais}
          onChange={(event) => {
            setPais(event.target.value);
            setCiudad("");
          }}
        >
          {ACCESS_REQUEST_COUNTRIES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {countryFlag(entry.code)} {entry.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={id} className={labelClassName}>
          Ciudad
        </label>
        <Select
          id={id}
          name="ciudad"
          required={!optional}
          disabled={disabled}
          className={fieldClassName}
          value={ciudad}
          onChange={(event) => setCiudad(event.target.value)}
        >
          <option value="" disabled={!optional}>
            {optional ? "Sin ciudad" : "Elegí tu ciudad"}
          </option>
          {country?.cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
          <option value={OTHER_CITY}>Otra ciudad…</option>
        </Select>
        {ciudad === OTHER_CITY ? (
          <Input
            id={`${id}-otra`}
            name="otraCiudad"
            type="text"
            required
            minLength={2}
            maxLength={80}
            disabled={disabled}
            className={fieldClassName}
            autoComplete="address-level2"
            placeholder={optional ? "Escribí la ciudad" : "Escribí tu ciudad"}
            defaultValue={initial?.otraCiudad}
            autoFocus={!initial?.otraCiudad}
          />
        ) : null}
      </div>
    </>
  );
}
