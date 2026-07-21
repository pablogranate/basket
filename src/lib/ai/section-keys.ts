import { z } from "zod";

export const SECTION_KEYS = [
  "grid",
  "people",
  "teams",
  "roles",
  "mi-jornada",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const sectionRefSchema = z.object({
  section: z.enum(SECTION_KEYS),
  params: z.record(z.string(), z.string()).optional(),
});

export type SectionAiContextRef = z.infer<typeof sectionRefSchema>;
