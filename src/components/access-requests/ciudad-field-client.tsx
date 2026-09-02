"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ACCESS_REQUEST_COUNTRIES,
  countryFlag,
  findAccessRequestCountry,
  OTHER_CITY,
} from "@/lib/access-requests/locations";

const LABEL_CLASS =
  "text-xs font-black uppercase tracking-[0.18em] text-[var(--n-500)]";

// Country first, then that country's cities. Changing the country resets the
// city so a Uruguayan city can never travel with an Argentine code; the action
// re-checks the pair anyway.
export function CiudadFieldClient({ id }: { id: string }) {
  const [pais, setPais] = useState("AR");
  const [ciudad, setCiudad] = useState("");
  const country = findAccessRequestCountry(pais);

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-pais`} className={LABEL_CLASS}>
          País
        </label>
        <Select
          id={`${id}-pais`}
          name="pais"
          required
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
        <label htmlFor={id} className={LABEL_CLASS}>
          Ciudad
        </label>
        <Select
          id={id}
          name="ciudad"
          required
          value={ciudad}
          onChange={(event) => setCiudad(event.target.value)}
        >
          <option value="" disabled>
            Elegí tu ciudad
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
            autoComplete="address-level2"
            placeholder="Escribí tu ciudad"
            autoFocus
          />
        ) : null}
      </div>
    </>
  );
}
