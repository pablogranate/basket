import Link from "next/link";
import {
  Camera,
  Download,
  LayoutGrid,
  Mic2,
  PencilLine,
  Rows3,
  ShieldCheck,
  UserRoundX,
  Users,
  Video,
  X,
} from "lucide-react";

import { upsertPersonAction } from "@/app/actions/people";
import { SectionAiAssistant } from "@/components/ai/section-ai-assistant";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { SetupPanel } from "@/components/layout/setup-panel";
import { PeopleDirectoryView } from "@/components/people/people-directory-view";
import { PeopleFilterBar } from "@/components/people/people-filter-bar";
import { PeopleAdminWarningModal } from "@/components/people/people-admin-warning-modal";
import { CreatePersonModal } from "@/components/people/create-person-modal";
import { PersonFunctionsField } from "@/components/people/person-functions-field";
import { PersonDeleteButton } from "@/components/people/person-delete-button";
import { PersonGrantAccessButton } from "@/components/people/person-grant-access-button";
import { PersonRevokeAccessButton } from "@/components/people/person-revoke-access-button";
import { PeopleTable } from "@/components/people/people-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageMessage } from "@/components/ui/page-message";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { SectionTableCard } from "@/components/ui/section-table-card";
import { StatCard } from "@/components/ui/stat-card";
import { Textarea } from "@/components/ui/textarea";
import { getToolbarIconButtonClassName } from "@/components/ui/toolbar-icon-button";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import { requireUserContext } from "@/lib/auth";
import { SECTION_COPY } from "@/lib/copy";
import { ROLE_SEED } from "@/lib/constants";
import { getPeopleData } from "@/lib/data/dashboard";
import { personHasPlatformAccess } from "@/lib/data/platform-access";
import { getAssignmentStateDisplayName, getRoleDisplayName } from "@/lib/display";
import { isSupabaseConfigured } from "@/lib/env";
import type { PeopleAiContextItem } from "@/lib/people-ai";
import {
  applyPeopleFilters,
  derivePeopleFilterOptions,
  parsePeopleFilters,
} from "@/lib/people-filters";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import { parseNotice } from "@/lib/search-params";
import { getSettingsSnapshot } from "@/lib/settings";
import { TEAM_DIRECTORY } from "@/lib/team-directory";
import type { PersonListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toCsvHref(people: PersonListItem[]) {
  const rows = [
    [
      "Nombre",
      "Rol principal",
      "Ciudad",
      "Responsable de equipos",
      "Teléfono",
      "Email",
      "Estado",
      "Notas",
    ],
    ...people.map((person) => {
      const meta = parsePersonNotesMeta(person.notes);

      return [
        person.full_name,
        meta.role || person.primary_role || "",
        meta.city || "",
        meta.coverage || "",
        person.phone ?? "",
        person.email ?? "",
        person.assignment_state,
        meta.notes ?? "",
      ];
    }),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");

  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

const ROLE_OPTIONS = Array.from(
  new Map(ROLE_SEED.map((role) => [role.name, role])).values(),
).map((role) => role.name);
const TEAM_OPTIONS = Array.from(
  new Set(TEAM_DIRECTORY.map((team) => team.official_name)),
).sort((left, right) => left.localeCompare(right, "es"));

function toPeopleAiContext(people: PersonListItem[]): PeopleAiContextItem[] {
  return people.map((person) => {
    const meta = parsePersonNotesMeta(person.notes);

    return {
      fullName: person.full_name,
      role: meta.role || person.primary_role || "",
      city: meta.city || "",
      coverage: meta.coverage || "",
      phone: person.phone ?? "",
      email: person.email ?? "",
      status: getAssignmentStateDisplayName(person.assignment_state),
      notes: meta.notes ?? "",
    };
  });
}

function getPersonRole(person: PersonListItem) {
  const meta = parsePersonNotesMeta(person.notes);
  return meta.role || person.primary_role || "";
}

function buildPeopleHref(
  params: Record<string, string | string[] | undefined>,
  updates: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (typeof rawValue === "string" && rawValue) {
      search.set(key, rawValue);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      search.delete(key);
      continue;
    }

    search.set(key, value);
  }

  const query = search.toString();
  return query ? `/people?${query}` : "/people";
}

export default async function PeoplePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { intent, notice } = parseNotice(resolvedSearchParams);
  const query =
    typeof resolvedSearchParams.q === "string"
      ? resolvedSearchParams.q.trim()
      : "";
  const viewMode =
    resolvedSearchParams.view === "directory" ? "directory" : "table";
  const editPersonId =
    typeof resolvedSearchParams.edit === "string"
      ? resolvedSearchParams.edit
      : undefined;

  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  const user = await requireUserContext();
  const allPeople = await getPeopleData(user);
  const filters = parsePeopleFilters(resolvedSearchParams);
  const filterOptions = derivePeopleFilterOptions(allPeople);
  const people = applyPeopleFilters({ people: allPeople, filters, query });
  const settings = await getSettingsSnapshot();
  const activePeople = people.filter((person) => person.active);
  const activeCount = activePeople.length;
  const inactiveCount = people.length - activeCount;
  const relatorCount = activePeople.filter(
    (person) => getPersonRole(person) === "Relator",
  ).length;
  const producerCount = activePeople.filter(
    (person) => getPersonRole(person) === "Productor",
  ).length;
  const cameraCount = activePeople.filter((person) =>
    getPersonRole(person).startsWith("Camara"),
  ).length;
  const exportHref = toCsvHref(people);
  const aiContext = toPeopleAiContext(people);
  const selectedPerson =
    allPeople.find((person) => person.id === editPersonId) ?? null;
  const selectedMeta = selectedPerson
    ? parsePersonNotesMeta(selectedPerson.notes)
    : null;
  let selectedPersonHasPlatformAccess = false;

  if (selectedPerson?.email && user.role === "admin") {
    selectedPersonHasPlatformAccess = await personHasPlatformAccess(
      selectedPerson.email,
    );
  }

  const currentPeopleHref = buildPeopleHref(resolvedSearchParams, {
    edit: undefined,
  });
  const selectedPeopleHref = selectedPerson
    ? buildPeopleHref(resolvedSearchParams, {
        edit: selectedPerson.id,
        view: viewMode === "directory" ? "directory" : undefined,
      })
    : null;

  return (
    <div className="space-y-10">
      <SectionPageHeader
        title={
          viewMode === "directory"
            ? SECTION_COPY.people.directoryTitle
            : SECTION_COPY.people.title
        }
        description={SECTION_COPY.people.description}
        actions={
          <>
            <ToolbarSearchField
              action="/people"
              defaultValue={query}
              placeholder="Buscar nombre, rol, responsable o ciudad..."
            >
              {viewMode === "directory" ? (
                <input type="hidden" name="view" value="directory" />
              ) : null}
              {filters.role ? (
                <input type="hidden" name="role" value={filters.role} />
              ) : null}
              {filters.state ? (
                <input type="hidden" name="state" value={filters.state} />
              ) : null}
              {filters.city ? (
                <input type="hidden" name="city" value={filters.city} />
              ) : null}
              {filters.team ? (
                <input type="hidden" name="team" value={filters.team} />
              ) : null}
            </ToolbarSearchField>
            {people.length ? (
              <>
                <a
                  href={exportHref}
                  download="basket-production-personal.csv"
                  aria-label="Descargar lista de personal"
                  title="Descargar lista de personal"
                  className={getToolbarIconButtonClassName({ tone: "violet" })}
                >
                  <Download className="size-4" />
                </a>
                <SectionAiAssistant
                  section="Personal"
                  title="Consulta el personal visible"
                  description="Haz preguntas sobre roles, coberturas, disponibilidad, teléfonos o correos del personal cargado en esta pantalla."
                  placeholder="Ej. ¿Qué rol tiene Santiago Córdoba y quién cubre Boca Juniors?"
                  contextLabel="Personal visible en la vista actual"
                  context={aiContext}
                  guidance="Prioriza rol principal, responsable de equipos, estado, teléfono, email y notas. Si preguntan por una persona, responde solo con lo visible en esta pantalla."
                  examples={[
                    "¿Qué rol tiene Santiago Córdoba?",
                    "¿Quién cubre Boca Juniors?",
                    "¿Qué datos hay de Juan Camilo y Samuel Venegas?",
                  ]}
                  hasGeminiKey={settings.hasGeminiKey}
                  buttonVariant="icon"
                />
              </>
            ) : null}
            {user.canEdit ? (
              <CreatePersonModal
                canEdit={user.canEdit}
                canManageAccess={user.role === "admin"}
                redirectTo={currentPeopleHref}
                roleOptions={ROLE_OPTIONS}
                teamOptions={TEAM_OPTIONS}
              />
            ) : null}
          </>
        }
      />

      <PageMessage intent={intent} message={notice} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Personal activo"
          value={activeCount}
          icon={Users}
          tone="accent"
        />
        <StatCard
          label="Personal inactivo"
          value={inactiveCount}
          icon={UserRoundX}
          tone="danger"
        />
        <StatCard
          label="Relatores activos"
          value={relatorCount}
          icon={Mic2}
          tone="info"
        />
        <StatCard
          label="Productores activos"
          value={producerCount}
          icon={Video}
          tone="neutral"
        />
        <StatCard
          label="Cámaras activas"
          value={cameraCount}
          icon={Camera}
          tone="neutral"
        />
      </div>

      {allPeople.length ? (
        <PeopleFilterBar
          filters={filters}
          options={filterOptions}
          query={query}
          view={viewMode}
        />
      ) : null}

      <SectionTableCard
        title={
          viewMode === "directory"
            ? SECTION_COPY.people.directoryTitle
            : SECTION_COPY.people.tableTitle
        }
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8dee8] bg-[#f6f8fb] px-3 py-1 text-xs font-bold text-[#596980]">
              <span className="size-1.5 rounded-full bg-[#8ea0b7]" />
              {activeCount} Activos
            </span>
            <SegmentedControl
              size="sm"
              items={[
                {
                  key: "table",
                  href: buildPeopleHref(resolvedSearchParams, { view: undefined }),
                  active: viewMode === "table",
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <Rows3 className="size-3.5" />
                      Tabla
                    </span>
                  ),
                },
                {
                  key: "directory",
                  href: buildPeopleHref(resolvedSearchParams, { view: "directory" }),
                  active: viewMode === "directory",
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <LayoutGrid className="size-3.5" />
                      Directorio
                    </span>
                  ),
                },
              ]}
            />
            {user.canEdit ? (
              <>
                {selectedPerson ? (
                  <Link
                    href={selectedPeopleHref ?? currentPeopleHref}
                    className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[#7b8798] transition hover:border-[#f0d9de] hover:bg-[#fff7f8] hover:text-[var(--accent)]"
                    title={`Editar ${selectedPerson.full_name}`}
                  >
                    <PencilLine className="size-4" />
                  </Link>
                ) : (
                  <PeopleAdminWarningModal />
                )}
                {selectedPerson ? (
                  <PersonDeleteButton
                    personId={selectedPerson.id}
                    fullName={selectedPerson.full_name}
                    redirectTo={currentPeopleHref}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        }
      >
        {people.length ? (
          viewMode === "directory" ? (
            <PeopleDirectoryView
              people={people}
              query={query}
              filters={filters}
              selectedPersonId={selectedPerson?.id ?? null}
              canEdit={user.canEdit}
            />
          ) : (
            <PeopleTable people={people} canEdit={user.canEdit} />
          )
        ) : (
          <div className="p-6">
            <EmptyState
              title="No hay personal cargado"
              description="Agrega integrantes del equipo técnico, talento y responsables para empezar a asignar."
            />
          </div>
        )}
      </SectionTableCard>

      {selectedPerson ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,23,42,0.48)] p-4 backdrop-blur-sm">
          <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[1000px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[#e6e8ec] bg-white shadow-[0_32px_80px_rgba(15,23,42,0.26)]">
            <div className="flex items-center justify-between border-b border-[#f1f3f5] px-8 py-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
                  Personal
                </p>
                <h3 className="text-[2rem] font-extrabold tracking-[-0.04em] text-[#1b1520]">
                  Editar personal
                </h3>
              </div>
              <Link
                href={currentPeopleHref}
                className="inline-flex size-10 items-center justify-center rounded-xl text-[#98a2b3] transition hover:bg-[#f7f5f6] hover:text-[#5b6472]"
                aria-label="Cerrar modal"
              >
                <X className="size-5" />
              </Link>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#faf7f7]">
              <form id="edit-person-form" action={upsertPersonAction}>
                <input type="hidden" name="redirectTo" value={currentPeopleHref} />
                <input type="hidden" name="personId" value={selectedPerson.id} />
                <input type="hidden" name="active" value="off" />

                <section className="bg-white px-8 py-8">
                  <div className="grid gap-8 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                      <div className="grid gap-6 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[#334155]">
                            Nombre completo
                          </span>
                          <Input
                            name="fullName"
                            defaultValue={selectedPerson.full_name}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] placeholder:text-[#98a2b3] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[#334155]">
                            Teléfono
                          </span>
                          <Input
                            name="phone"
                            defaultValue={selectedPerson.phone ?? ""}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] placeholder:text-[#98a2b3] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[#334155]">
                            Correo electrónico
                          </span>
                          <Input
                            name="email"
                            defaultValue={selectedPerson.email ?? ""}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] placeholder:text-[#98a2b3] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[#334155]">
                            Ciudad
                          </span>
                          <Input
                            name="city"
                            defaultValue={selectedMeta?.city ?? ""}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] placeholder:text-[#98a2b3] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[#334155]">
                            Rol principal
                          </span>
                          <Select
                            name="roleName"
                            defaultValue={selectedMeta?.role ?? ""}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)]"
                          >
                            <option value="">Seleccionar rol...</option>
                            {ROLE_OPTIONS.map((roleName) => (
                              <option key={roleName} value={roleName}>
                                {getRoleDisplayName(roleName)}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <div className="md:col-span-2">
                          <PersonFunctionsField
                            selected={selectedPerson.functions}
                            disabled={!user.canEdit}
                          />
                        </div>
                        <label className="flex items-center gap-3 rounded-[var(--panel-radius)] border border-[#e5e7eb] bg-[#f9f9f9] px-4 py-3 text-sm font-semibold text-[#1f2937] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)]">
                          <input
                            type="checkbox"
                            name="active"
                            value="on"
                            defaultChecked={selectedPerson.active}
                            disabled={!user.canEdit}
                            className="size-4"
                          />
                          Activo para asignación
                        </label>
                        <label className="space-y-2 md:col-span-2">
                          <span className="text-sm font-semibold text-[#334155]">
                            Responsable
                          </span>
                          <>
                            <Input
                              name="coverageTeams"
                              list="people-team-options-edit"
                              defaultValue={selectedMeta?.coverage ?? ""}
                              placeholder="Escribe o pega equipos y el sistema te sugerirá coincidencias"
                              disabled={!user.canEdit}
                              className="h-12 rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] placeholder:text-[#98a2b3] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)]"
                            />
                            <datalist id="people-team-options-edit">
                              {TEAM_OPTIONS.map((teamName) => (
                                <option key={teamName} value={teamName} />
                              ))}
                            </datalist>
                          </>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-sm font-semibold text-[#334155]">
                        Notas
                      </span>
                      <Textarea
                        name="notes"
                        defaultValue={selectedMeta?.notes ?? ""}
                        disabled={!user.canEdit}
                        className="min-h-[260px] rounded-[var(--panel-radius)] border-[#e5e7eb] bg-[#f9f9f9] text-[15px] font-medium text-[#1f2937] placeholder:text-[#98a2b3] shadow-[inset_0_2px_4px_rgba(15,23,42,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(230,18,56,0.08)]"
                      />
                    </div>
                  </div>
                </section>
              </form>

              {user.role === "admin" ? (
                <section className="border-t border-[#f1f3f5] bg-[#faf7f7] px-8 py-8">
                  <div className="rounded-[var(--panel-radius)] border-2 border-[rgba(211,49,49,0.10)] bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-4">
                        <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[rgba(211,49,49,0.1)] text-[var(--accent)]">
                          <ShieldCheck className="size-6" />
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-[#111827]">
                            Acceso a la plataforma
                          </h4>
                          <p className="max-w-xl text-sm text-[#667085]">
                            {selectedPerson.email
                              ? selectedPersonHasPlatformAccess
                                ? "Este colaborador puede iniciar sesión y entrar directo a Mi jornada."
                                : "Este colaborador no tiene acceso activo a la plataforma en este momento."
                              : "Primero debes guardar un correo electrónico para poder gestionar acceso."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-2 lg:items-end">
                        <span
                          className={cn(
                            "relative inline-flex h-7 w-14 items-center rounded-full transition",
                            selectedPersonHasPlatformAccess
                              ? "bg-[var(--accent)]"
                              : "bg-[#d8dee8]",
                          )}
                          aria-hidden="true"
                        >
                          <span
                            className={cn(
                              "inline-block size-6 rounded-full border border-white bg-white transition",
                              selectedPersonHasPlatformAccess
                                ? "translate-x-7"
                                : "translate-x-0.5",
                            )}
                          />
                        </span>

                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                          {selectedPersonHasPlatformAccess
                            ? "Acceso habilitado"
                            : "Acceso desactivado"}
                        </span>
                      </div>
                    </div>

                    {selectedPerson.email ? (
                      selectedPersonHasPlatformAccess ? (
                        <div className="mt-4 flex justify-end">
                          <PersonRevokeAccessButton
                            personId={selectedPerson.id}
                            redirectTo={selectedPeopleHref ?? currentPeopleHref}
                          />
                        </div>
                      ) : (
                        <PersonGrantAccessButton
                          personId={selectedPerson.id}
                          redirectTo={selectedPeopleHref ?? currentPeopleHref}
                        />
                      )
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[#f1f3f5] bg-white px-8 py-5">
              <div>
                {user.canEdit ? (
                  <PersonDeleteButton
                    personId={selectedPerson.id}
                    fullName={selectedPerson.full_name}
                    redirectTo={currentPeopleHref}
                    className="h-11 w-auto rounded-[var(--panel-radius)] border-[#111827] bg-[#111827] px-5 text-sm font-bold text-white hover:border-black hover:bg-black hover:text-white"
                    label="Eliminar usuario"
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-4">
                <Link
                  href={currentPeopleHref}
                  className="inline-flex h-11 items-center justify-center rounded-[var(--panel-radius)] px-6 text-sm font-bold text-[#667085] transition hover:bg-[#f2f4f7]"
                >
                  Cancelar
                </Link>

                {user.canEdit ? (
                  <Button
                    type="submit"
                    form="edit-person-form"
                    className="h-11 rounded-[var(--panel-radius)] px-8 text-sm font-bold shadow-[0_14px_32px_rgba(230,18,56,0.18)]"
                  >
                    Guardar cambios
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled
                    className="h-11 rounded-[var(--panel-radius)] px-7"
                  >
                    Solo lectura
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
