import {
  parsed,
  parseFailure,
  type ParseResult,
} from "@/lib/actions/define-action";
import {
  isAccessRequestFuncion,
  type AccessRequestFuncion,
} from "@/lib/access-requests/constants";
import { readCiudadField } from "@/lib/ciudad";
import { isE164Phone } from "@/lib/access-requests/phone";

export type CompleteFichaInput = {
  funcion: AccessRequestFuncion;
  phone: string;
  ciudad: string;
};

export function parseCompleteFicha(
  formData: FormData,
): ParseResult<CompleteFichaInput> {
  const funcion = String(formData.get("funcion") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!isAccessRequestFuncion(funcion)) {
    return parseFailure("Elegí una función de la lista.");
  }

  if (!isE164Phone(phone)) {
    return parseFailure("Revisá el teléfono: falta el país o tiene caracteres.");
  }

  const ciudadField = readCiudadField(formData);

  if (!ciudadField.ok || !ciudadField.ciudad) {
    return parseFailure("Elegí tu país y tu ciudad de la lista.");
  }

  return parsed({ funcion, phone, ciudad: ciudadField.ciudad });
}
