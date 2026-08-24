import { Suspense } from "react";

import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";

import { upsertPersonAction } from "@/app/actions/people";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { SetupPanel } from "@/components/layout/setup-panel";
import { CreatePersonModal } from "@/components/people/create-person-modal-lazy";
import { PeopleHeaderExtras } from "@/components/people/people-header-extras";
import { PeopleRedirectToInput } from "@/components/people/people-redirect-to";
import { PeopleSearchField } from "@/components/people/people-search-field";
import { PeopleSyncButton } from "@/components/people/people-sync-button";
import { PeopleViewProvider } from "@/components/people/people-view-context";
import { PeopleWorkspaceClient } from "@/components/people/people-workspace-client";
import { PersonFunctionsField } from "@/components/people/person-functions-field";
import { PersonDeleteButton } from "@/components/people/person-delete-button";
import { PersonGrantAccessButton } from "@/components/people/person-grant-access-button";
import { PersonRevokeAccessButton } from "@/components/people/person-revoke-access-button";
import { PersonAccessRoleForm } from "@/components/people/person-access-role-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageMessage } from "@/components/ui/page-message";
import { Textarea } from "@/components/ui/textarea";
import { requireUserContext, type UserContext } from "@/lib/auth";
import {
  canManageAccessTier,
  isAccessManagerRole,
} from "@/lib/auth-access";
import { SECTION_COPY } from "@/lib/copy";
import type { AppRole } from "@/lib/database.types";
import { getPeopleData } from "@/lib/data/dashboard";
import { getLastPeopleSync } from "@/lib/people/sync";
import { getTeamDirectory } from "@/lib/data/teams";
import { PersonTeamsField } from "@/components/people/person-teams-field";
import { getPlatformAccessRole } from "@/lib/data/platform-access";
import { getRoleDisplayName } from "@/lib/display";
import { isSupabaseConfigured } from "@/lib/env";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import { parseNotice } from "@/lib/search-params";
import type { PersonListItem, PersonTeamLink } from "@/lib/types";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  const editPersonId =
    typeof resolvedSearchParams.edit === "string"
      ? resolvedSearchParams.edit
      : undefined;

  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  // Nothing but the permission context is awaited here: the people, settings,
  // team-directory and last-sync reads all start unawaited and stream into the
  // Suspense boundary that actually needs them, so none of them gate first paint.
  const user = await requireUserContext();
  const peoplePromise = getPeopleData(user);
  const teamOptionsPromise = getTeamDirectory(user).then(buildTeamOptions);
  const canManageAccess = isAccessManagerRole(user.role);
  const canSelectAccessTier = user.role === "admin";
  const currentPeopleHref = buildPeopleHref(resolvedSearchParams, {
    edit: undefined,
  });
  const lastPeopleSyncPromise = canManageAccess ? getLastPeopleSync() : null;

  return (
    <PeopleViewProvider peoplePromise={peoplePromise}>
      <div className="space-y-10">
        <SectionPageHeader
          title={SECTION_COPY.people.title}
          description={SECTION_COPY.people.description}
          actions={
            <>
              <PeopleSearchField />
              <PeopleHeaderExtras />
              {lastPeopleSyncPromise ? (
                <Suspense fallback={null}>
                  <PeopleSyncSlot
                    lastPeopleSyncPromise={lastPeopleSyncPromise}
                  />
                </Suspense>
              ) : null}
              {user.canEdit ? (
                <Suspense fallback={null}>
                  <PeopleCreateSlot
                    teamOptionsPromise={teamOptionsPromise}
                    canManageAccess={canManageAccess}
                    canSelectAccessTier={canSelectAccessTier}
                  />
                </Suspense>
              ) : null}
            </>
          }
        />

        <PageMessage intent={intent} message={notice} />

        <Suspense fallback={<PeopleDataSkeleton />}>
          <PeopleWorkspaceClient
            canEdit={user.canEdit}
            deleteButton={
              user.canEdit && editPersonId ? (
                <Suspense fallback={null}>
                  <SelectedPersonDeleteButton
                    peoplePromise={peoplePromise}
                    editPersonId={editPersonId}
                  />
                </Suspense>
              ) : null
            }
          />
        </Suspense>

        {editPersonId ? (
          <Suspense fallback={null}>
            <PeopleEditModal
              peoplePromise={peoplePromise}
              teamOptionsPromise={teamOptionsPromise}
              user={user}
              editPersonId={editPersonId}
              canManageAccess={canManageAccess}
              canSelectAccessTier={canSelectAccessTier}
              currentPeopleHref={currentPeopleHref}
            />
          </Suspense>
        ) : null}
      </div>
    </PeopleViewProvider>
  );
}

async function PeopleSyncSlot({
  lastPeopleSyncPromise,
}: {
  lastPeopleSyncPromise: ReturnType<typeof getLastPeopleSync>;
}) {
  const lastPeopleSync = await lastPeopleSyncPromise;
  const lastSyncedLabel = lastPeopleSync
    ? formatInTimeZone(
        lastPeopleSync.started_at,
        "America/Argentina/Buenos_Aires",
        "d MMM · HH:mm",
        { locale: es },
      )
    : undefined;

  return <PeopleSyncButton lastSyncedLabel={lastSyncedLabel} />;
}

async function PeopleCreateSlot({
  teamOptionsPromise,
  canManageAccess,
  canSelectAccessTier,
}: {
  teamOptionsPromise: Promise<PersonTeamLink[]>;
  canManageAccess: boolean;
  canSelectAccessTier: boolean;
}) {
  const teamOptions = await teamOptionsPromise;

  return (
    <CreatePersonModal
      canEdit
      canManageAccess={canManageAccess}
      canSelectAccessTier={canSelectAccessTier}
      teamOptions={teamOptions}
    />
  );
}

async function SelectedPersonDeleteButton({
  peoplePromise,
  editPersonId,
}: {
  peoplePromise: Promise<PersonListItem[]>;
  editPersonId: string;
}) {
  const allPeople = await peoplePromise;
  const selectedPerson = allPeople.find((person) => person.id === editPersonId);

  if (!selectedPerson) {
    return null;
  }

  return (
    <PersonDeleteButton
      personId={selectedPerson.id}
      fullName={selectedPerson.full_name}
    />
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

async function PeopleEditModal({
  peoplePromise,
  teamOptionsPromise,
  user,
  editPersonId,
  canManageAccess,
  canSelectAccessTier,
  currentPeopleHref,
}: {
  peoplePromise: Promise<PersonListItem[]>;
  teamOptionsPromise: Promise<PersonTeamLink[]>;
  user: UserContext;
  editPersonId: string;
  canManageAccess: boolean;
  canSelectAccessTier: boolean;
  currentPeopleHref: string;
}) {
  const [allPeople, teamOptions] = await Promise.all([
    peoplePromise,
    teamOptionsPromise,
  ]);
  const selectedPerson =
    allPeople.find((person) => person.id === editPersonId) ?? null;

  if (!selectedPerson) {
    return null;
  }

  const selectedMeta = parsePersonNotesMeta(selectedPerson.notes);
  let selectedPersonAccessRole: AppRole | null = null;

  if (selectedPerson.email && canManageAccess) {
    selectedPersonAccessRole = await getPlatformAccessRole(selectedPerson.email);
  }

  const selectedPersonHasPlatformAccess = selectedPersonAccessRole !== null;
  // Narrow to the three grantable tiers so the re-tier form can be typed.
  const selectedPersonAccessTier =
    selectedPersonAccessRole === "admin" ||
    selectedPersonAccessRole === "editor" ||
    selectedPersonAccessRole === "collaborator"
      ? selectedPersonAccessRole
      : null;
  // Productores may revoke only Externo logins; admins may revoke any tier.
  const canRevokeSelectedAccess =
    selectedPersonAccessRole !== null &&
    canManageAccessTier(user.role, selectedPersonAccessRole);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(28,13,16,0.48)] p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[1000px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--n-100)] bg-white shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between border-b border-[var(--n-100)] px-5 py-6 sm:px-8">
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
            <PeopleRedirectToInput />
            <input type="hidden" name="personId" value={selectedPerson.id} />
            <input type="hidden" name="active" value="off" />

            <section className="bg-white px-5 py-8 sm:px-8">
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
                        defaultValue={selectedMeta.city}
                        disabled={!user.canEdit}
                        className="h-12 rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
                      />
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
                    defaultValue={selectedMeta.notes}
                    disabled={!user.canEdit}
                    className="min-h-[260px] rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] text-[15px] font-medium text-[var(--n-800)] placeholder:text-[var(--n-400)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
                  />
                </div>
              </div>
            </section>
          </form>

          {canManageAccess ? (
            <section className="border-t border-[var(--n-100)] bg-[var(--n-50)] px-5 py-8 sm:px-8">
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
                      <div className="mt-5 flex flex-col gap-4 border-t border-[var(--n-100)] pt-5 lg:flex-row lg:items-start lg:justify-between">
                        {canSelectAccessTier && selectedPersonAccessTier ? (
                          <PersonAccessRoleForm
                            personId={selectedPerson.id}
                            currentAccessRole={selectedPersonAccessTier}
                          />
                        ) : (
                          <p className="text-sm text-[var(--n-500)]">
                            Nivel de acceso actual:{" "}
                            {getRoleDisplayName(selectedPersonAccessRole ?? "")}
                          </p>
                        )}

                        <div className="flex justify-end lg:pt-8">
                          <PersonRevokeAccessButton
                            personId={selectedPerson.id}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-[var(--n-500)]">
                        Solo un admin puede revocar o cambiar este acceso.
                      </p>
                    )
                  ) : (
                    <PersonGrantAccessButton
                      personId={selectedPerson.id}
                      canSelectAccessTier={canSelectAccessTier}
                    />
                  )
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[var(--n-100)] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8">
          <div>
            {user.canEdit ? (
              <PersonDeleteButton
                personId={selectedPerson.id}
                fullName={selectedPerson.full_name}
                className="h-11 w-auto rounded-[var(--panel-radius)] border-[var(--n-900)] bg-[var(--n-900)] px-5 text-sm font-bold text-white hover:border-black hover:bg-black hover:text-white"
                label="Eliminar usuario"
              />
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 sm:gap-4">
            <Link
              href={currentPeopleHref}
              className="inline-flex h-11 items-center justify-center rounded-[var(--panel-radius)] px-4 text-sm font-bold text-[var(--n-500)] transition hover:bg-[var(--n-100)] sm:px-6"
            >
              Cancelar
            </Link>

            {user.canEdit ? (
              <Button
                type="submit"
                form="edit-person-form"
                className="h-11 rounded-[var(--panel-radius)] px-5 text-sm font-bold shadow-[0_14px_32px_rgba(227,27,35,0.18)] sm:px-8"
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
  );
}
