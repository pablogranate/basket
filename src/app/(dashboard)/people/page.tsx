import { Suspense } from "react";

import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import Link from "next/link";
import {
  Camera,
  Download,
  Mic2,
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
import { PeopleFilterBar } from "@/components/people/people-filter-bar";
import { CreatePersonModal } from "@/components/people/create-person-modal-lazy";
import { PersonFunctionsField } from "@/components/people/person-functions-field";
import { PeopleSyncButton } from "@/components/people/people-sync-button";
import { PersonDeleteButton } from "@/components/people/person-delete-button";
import { PersonGrantAccessButton } from "@/components/people/person-grant-access-button";
import { PersonRevokeAccessButton } from "@/components/people/person-revoke-access-button";
import { PeopleTable } from "@/components/people/people-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageMessage } from "@/components/ui/page-message";
import { Select } from "@/components/ui/select";
import { SectionTableCard } from "@/components/ui/section-table-card";
import { StatCard } from "@/components/ui/stat-card";
import { Textarea } from "@/components/ui/textarea";
import { getToolbarIconButtonClassName } from "@/components/ui/toolbar-icon-button";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import { requireUserContext, type UserContext } from "@/lib/auth";
import {
  canManageAccessTier,
  isAccessManagerRole,
} from "@/lib/auth-access";
import { SECTION_COPY } from "@/lib/copy";
import { ROLE_SEED } from "@/lib/constants";
import type { AppRole } from "@/lib/database.types";
import { getPeopleData } from "@/lib/data/dashboard";
import { getLastPeopleSync } from "@/lib/people/sync";
import { getTeamDirectory } from "@/lib/data/teams";
import { PersonTeamsField } from "@/components/people/person-teams-field";
import { getPlatformAccessRole } from "@/lib/data/platform-access";
import { getRoleDisplayName } from "@/lib/display";
import { isSupabaseConfigured } from "@/lib/env";
import {
  applyPeopleFilters,
  derivePeopleFilterOptions,
  parsePeopleFilters,
} from "@/lib/people-filters";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import { personCoverageNames } from "@/lib/team-responsibles";
import { parseNotice } from "@/lib/search-params";
import { getSettingsSnapshot } from "@/lib/settings";
import type { PersonListItem, PersonTeamLink } from "@/lib/types";
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
      "Club",
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
        personCoverageNames(person).join(", "),
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

// The "Club" multi-select is name-driven downstream (responsible lookups match
// by team name), so collapse the directory's per-category team rows to one
// option per distinct name.
function buildTeamOptions(
  teams: { id: string; official_name: string }[],
): PersonTeamLink[] {
  const byName = new Map<string, PersonTeamLink>();

  for (const team of teams) {
    const name = team.official_name.trim();
    if (name && !byName.has(name)) {
      byName.set(name, { id: team.id, name });
    }
  }

  return Array.from(byName.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "es"),
  );
}

function buildPeopleContextParams(
  filters: ReturnType<typeof parsePeopleFilters>,
  query: string,
) {
  const params: Record<string, string> = {};

  if (query) params.q = query;
  if (filters.role) params.role = filters.role;
  if (filters.state) params.state = filters.state;
  if (filters.city) params.city = filters.city;
  if (filters.team) params.team = filters.team;

  return params;
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
  const editPersonId =
    typeof resolvedSearchParams.edit === "string"
      ? resolvedSearchParams.edit
      : undefined;

  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  // Fire the people + settings reads without awaiting so the page shell
  // (header, toolbar) streams immediately; the data region and the
  // data-dependent header buttons resolve under their own Suspense boundaries
  // sharing the same promise (single round-trip).
  const settingsPromise = getSettingsSnapshot();
  const user = await requireUserContext();
  const peoplePromise = getPeopleData(user);
  const teamOptions = buildTeamOptions(await getTeamDirectory(user));
  const filters = parsePeopleFilters(resolvedSearchParams);
  const canManageAccess = isAccessManagerRole(user.role);
  const canSelectAccessTier = user.role === "admin";
  const currentPeopleHref = buildPeopleHref(resolvedSearchParams, {
    edit: undefined,
  });
  const lastPeopleSync = canManageAccess ? await getLastPeopleSync() : null;
  const lastPeopleSyncLabel = lastPeopleSync
    ? formatInTimeZone(
        lastPeopleSync.started_at,
        "America/Argentina/Buenos_Aires",
        "d MMM · HH:mm",
        { locale: es },
      )
    : undefined;

  return (
    <div className="space-y-10">
      <SectionPageHeader
        title={SECTION_COPY.people.title}
        description={SECTION_COPY.people.description}
        actions={
          <>
            <ToolbarSearchField
              action="/people"
              defaultValue={query}
              placeholder="Buscar nombre, rol, responsable o ciudad..."
            >
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
            <Suspense fallback={null}>
              <PeopleHeaderExtras
                peoplePromise={peoplePromise}
                settingsPromise={settingsPromise}
                filters={filters}
                query={query}
              />
            </Suspense>
            {canManageAccess ? (
              <PeopleSyncButton
                redirectTo={currentPeopleHref}
                lastSyncedLabel={lastPeopleSyncLabel}
              />
            ) : null}
            {user.canEdit ? (
              <CreatePersonModal
                canEdit={user.canEdit}
                canManageAccess={canManageAccess}
                canSelectAccessTier={canSelectAccessTier}
                redirectTo={currentPeopleHref}
                roleOptions={ROLE_OPTIONS}
                teamOptions={teamOptions}
              />
            ) : null}
          </>
        }
      />

      <PageMessage intent={intent} message={notice} />

      <Suspense fallback={<PeopleDataSkeleton />}>
        <PeopleDataRegion
          peoplePromise={peoplePromise}
          user={user}
          resolvedSearchParams={resolvedSearchParams}
          filters={filters}
          query={query}
          editPersonId={editPersonId}
          canManageAccess={canManageAccess}
          canSelectAccessTier={canSelectAccessTier}
          currentPeopleHref={currentPeopleHref}
          teamOptions={teamOptions}
        />
      </Suspense>
    </div>
  );
}

async function PeopleHeaderExtras({
  peoplePromise,
  settingsPromise,
  filters,
  query,
}: {
  peoplePromise: Promise<PersonListItem[]>;
  settingsPromise: ReturnType<typeof getSettingsSnapshot>;
  filters: ReturnType<typeof parsePeopleFilters>;
  query: string;
}) {
  const [allPeople, settings] = await Promise.all([
    peoplePromise,
    settingsPromise,
  ]);
  const people = applyPeopleFilters({ people: allPeople, filters, query });

  if (!people.length) {
    return null;
  }

  return (
    <>
      <a
        href={toCsvHref(people)}
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
        contextCount={people.length}
        contextRef={{
          section: "people",
          params: buildPeopleContextParams(filters, query),
        }}
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
  );
}

function PeopleDataSkeleton() {
  return (
    <div className="space-y-10" aria-busy="true" aria-live="polite">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}

async function PeopleDataRegion({
  peoplePromise,
  user,
  resolvedSearchParams,
  filters,
  query,
  editPersonId,
  canManageAccess,
  canSelectAccessTier,
  currentPeopleHref,
  teamOptions,
}: {
  peoplePromise: Promise<PersonListItem[]>;
  user: UserContext;
  resolvedSearchParams: Record<string, string | string[] | undefined>;
  filters: ReturnType<typeof parsePeopleFilters>;
  query: string;
  editPersonId: string | undefined;
  canManageAccess: boolean;
  canSelectAccessTier: boolean;
  currentPeopleHref: string;
  teamOptions: PersonTeamLink[];
}) {
  const allPeople = await peoplePromise;
  const filterOptions = derivePeopleFilterOptions(allPeople);
  const people = applyPeopleFilters({ people: allPeople, filters, query });
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
  const selectedPerson =
    allPeople.find((person) => person.id === editPersonId) ?? null;
  const selectedMeta = selectedPerson
    ? parsePersonNotesMeta(selectedPerson.notes)
    : null;
  let selectedPersonAccessRole: AppRole | null = null;

  if (selectedPerson?.email && canManageAccess) {
    selectedPersonAccessRole = await getPlatformAccessRole(selectedPerson.email);
  }

  const selectedPersonHasPlatformAccess = selectedPersonAccessRole !== null;
  // Productores may revoke only Externo logins; admins may revoke any tier.
  const canRevokeSelectedAccess =
    selectedPersonAccessRole !== null &&
    canManageAccessTier(user.role, selectedPersonAccessRole);

  const selectedPeopleHref = selectedPerson
    ? buildPeopleHref(resolvedSearchParams, {
        edit: selectedPerson.id,
      })
    : null;

  return (
    <>
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
        />
      ) : null}

      <SectionTableCard
        title={SECTION_COPY.people.tableTitle}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--n-200)] bg-[var(--n-100)] px-3 py-1 text-xs font-bold text-[var(--n-600)]">
              <span className="size-1.5 rounded-full bg-[var(--n-400)]" />
              {activeCount} Activos
            </span>
            {user.canEdit && selectedPerson ? (
              <PersonDeleteButton
                personId={selectedPerson.id}
                fullName={selectedPerson.full_name}
                redirectTo={currentPeopleHref}
              />
            ) : null}
          </div>
        }
      >
        {people.length ? (
          <PeopleTable people={people} canEdit={user.canEdit} />
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(28,13,16,0.48)] p-4 backdrop-blur-sm">
          <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[1000px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--n-100)] bg-white shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between border-b border-[var(--n-100)] px-8 py-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
                  Personal
                </p>
                <h3 className="text-[2rem] font-extrabold tracking-[-0.04em] text-[var(--n-900)]">
                  Editar personal
                </h3>
              </div>
              <Link
                href={currentPeopleHref}
                className="inline-flex size-10 items-center justify-center rounded-xl text-[var(--n-400)] transition hover:bg-[var(--n-100)] hover:text-[var(--n-600)]"
                aria-label="Cerrar modal"
              >
                <X className="size-5" />
              </Link>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[var(--n-50)]">
              <form id="edit-person-form" action={upsertPersonAction}>
                <input type="hidden" name="redirectTo" value={currentPeopleHref} />
                <input type="hidden" name="personId" value={selectedPerson.id} />
                <input type="hidden" name="active" value="off" />

                <section className="bg-white px-8 py-8">
                  <div className="grid gap-8 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                      <div className="grid gap-6 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[var(--n-700)]">
                            Nombre completo
                          </span>
                          <Input
                            name="fullName"
                            defaultValue={selectedPerson.full_name}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[var(--n-700)]">
                            Teléfono
                          </span>
                          <Input
                            name="phone"
                            defaultValue={selectedPerson.phone ?? ""}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[var(--n-700)]">
                            Correo electrónico
                          </span>
                          <Input
                            name="email"
                            defaultValue={selectedPerson.email ?? ""}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[var(--n-700)]">
                            Ciudad
                          </span>
                          <Input
                            name="city"
                            defaultValue={selectedMeta?.city ?? ""}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-[var(--n-700)]">
                            Rol principal
                          </span>
                          <Select
                            name="roleName"
                            defaultValue={selectedMeta?.role ?? ""}
                            disabled={!user.canEdit}
                            className="h-12 rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
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
                        <label className="flex items-center gap-3 rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-4 py-3 text-sm font-semibold text-[var(--n-800)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)]">
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
                        <div className="md:col-span-2">
                          <PersonTeamsField
                            options={teamOptions}
                            selected={selectedPerson.teams.map((team) => team.id)}
                            disabled={!user.canEdit}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--n-700)]">
                        Notas
                      </span>
                      <Textarea
                        name="notes"
                        defaultValue={selectedMeta?.notes ?? ""}
                        disabled={!user.canEdit}
                        className="min-h-[260px] rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
                      />
                    </div>
                  </div>
                </section>
              </form>

              {canManageAccess ? (
                <section className="border-t border-[var(--n-100)] bg-[var(--n-50)] px-8 py-8">
                  <div className="rounded-[var(--panel-radius)] border-2 border-[var(--accent-border)] bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-4">
                        <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                          <ShieldCheck className="size-6" />
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-[var(--n-900)]">
                            Acceso a la plataforma
                          </h4>
                          <p className="max-w-xl text-sm text-[var(--n-500)]">
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
                              : "bg-[var(--n-200)]",
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
                        canRevokeSelectedAccess ? (
                          <div className="mt-4 flex justify-end">
                            <PersonRevokeAccessButton
                              personId={selectedPerson.id}
                              redirectTo={
                                selectedPeopleHref ?? currentPeopleHref
                              }
                            />
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-[var(--n-500)]">
                            Solo un admin puede revocar este acceso.
                          </p>
                        )
                      ) : (
                        <PersonGrantAccessButton
                          personId={selectedPerson.id}
                          canSelectAccessTier={canSelectAccessTier}
                          redirectTo={selectedPeopleHref ?? currentPeopleHref}
                        />
                      )
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[var(--n-100)] bg-white px-8 py-5">
              <div>
                {user.canEdit ? (
                  <PersonDeleteButton
                    personId={selectedPerson.id}
                    fullName={selectedPerson.full_name}
                    redirectTo={currentPeopleHref}
                    className="h-11 w-auto rounded-[var(--panel-radius)] border-[var(--n-900)] bg-[var(--n-900)] px-5 text-sm font-bold text-white hover:border-black hover:bg-black hover:text-white"
                    label="Eliminar usuario"
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-4">
                <Link
                  href={currentPeopleHref}
                  className="inline-flex h-11 items-center justify-center rounded-[var(--panel-radius)] px-6 text-sm font-bold text-[var(--n-500)] transition hover:bg-[var(--n-100)]"
                >
                  Cancelar
                </Link>

                {user.canEdit ? (
                  <Button
                    type="submit"
                    form="edit-person-form"
                    className="h-11 rounded-[var(--panel-radius)] px-8 text-sm font-bold shadow-[0_14px_32px_rgba(227,27,35,0.18)]"
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
    </>
  );
}
