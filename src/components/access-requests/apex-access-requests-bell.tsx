import { CampanaDeSolicitudes, type SolicitudPendiente } from "basket-tv-ui";

import {
  approveAppAccessRequestAction,
  rejectAppAccessRequestAction,
} from "@/app/actions/app-access-requests";
import { AccessRequestDecisionForm } from "@/components/access-requests/access-request-decision-form";
import { isSiblingApp, SIBLING_APP_LABELS } from "@/lib/acceso/catalog";
import type { AccessRequestSummary } from "@/lib/access-requests/requests";
import type { getApexAccessRequestReview } from "@/lib/access-requests/review";

type ApexReview = Awaited<ReturnType<typeof getApexAccessRequestReview>>;

const APEX_PATH = "/";

function appLabel(app: string): string {
  if (app === "portal") {
    return "Producción";
  }

  return isSiblingApp(app) ? SIBLING_APP_LABELS[app] : app;
}

function declared(request: AccessRequestSummary) {
  return {
    id: request.id,
    app: request.app,
    nombreDeApp: appLabel(request.app),
    nombre: request.full_name,
    email: request.email,
    telefono: request.phone,
    funcion: request.funcion,
    ciudad: request.ciudad,
    mensaje: request.mensaje,
  };
}

// The super admins' bell on the apex directory: every app's Solicitudes,
// newest first. A portal one opens the portal's own form (ficha link or merge,
// Función, tier); a sibling one the app's role picker.
export function ApexAccessRequestsBell({ review }: { review: ApexReview }) {
  const portal = review.portal.items.map((item) => ({
    createdAt: item.request.created_at,
    solicitud: {
      ...declared(item.request),
      roles: [],
      decision: (
        <AccessRequestDecisionForm
          item={item}
          funcionOptions={review.portal.funcionOptions}
          canSelectAccessTier
          redirectTo={APEX_PATH}
        />
      ),
    },
  }));
  const siblings = review.siblings.map(({ request, roles }) => ({
    createdAt: request.created_at,
    solicitud: {
      ...declared(request),
      roles: roles.map((role) => ({ valor: role.key, etiqueta: role.label })),
    },
  }));
  const solicitudes: SolicitudPendiente[] = [...portal, ...siblings]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ solicitud }) => solicitud);

  return (
    <CampanaDeSolicitudes
      solicitudes={solicitudes}
      aprobar={approveAppAccessRequestAction}
      rechazar={rejectAppAccessRequestAction}
      camposOcultos={{ redirectTo: APEX_PATH }}
    />
  );
}
