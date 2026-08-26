// The phone field posts E.164 ("+5491122334455"). Kept here rather than inline
// in the action so the boundary the form has to satisfy is stated once and
// tested — the first version of the field posted national-formatted text and
// every submit was rejected.
const E164_PATTERN = /^\+\d{8,15}$/;

export function isE164Phone(value: string) {
  return E164_PATTERN.test(value.trim());
}
