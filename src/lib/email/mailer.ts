import "server-only";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import { appEnv, assertSmtpEnv } from "@/lib/env";
import { logError } from "@/lib/log";

const globalForMailer = globalThis as unknown as {
  mailTransport?: Transporter;
};

function getTransport(): Transporter {
  assertSmtpEnv();

  const transport =
    globalForMailer.mailTransport ??
    nodemailer.createTransport({
      host: appEnv.smtpHost,
      port: Number(appEnv.smtpPort),
      secure: false, // STARTTLS on 587
      auth: {
        user: appEnv.smtpUser,
        pass: appEnv.smtpPass,
      },
    });

  if (process.env.NODE_ENV !== "production") {
    globalForMailer.mailTransport = transport;
  }

  return transport;
}

const APP_NAME = "BasquetPass";

export async function sendMagicLinkEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  try {
    await getTransport().sendMail({
      from: appEnv.mailFrom,
      to,
      subject: `Tu enlace de acceso a ${APP_NAME}`,
      text: `Ingresa a ${APP_NAME} con este enlace (válido por tiempo limitado):\n\n${url}\n\nSi no solicitaste este acceso, ignora este correo.`,
      html: `
        <p>Ingresa a <strong>${APP_NAME}</strong> con este enlace (válido por tiempo limitado):</p>
        <p><a href="${url}">Iniciar sesión</a></p>
        <p style="color:#666;font-size:13px">Si no solicitaste este acceso, ignora este correo.</p>
      `,
    });
  } catch (error) {
    logError("[mailer] failed to send magic link", error);
    throw error;
  }
}

export async function sendLoginCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}) {
  try {
    await getTransport().sendMail({
      from: appEnv.mailFrom,
      to,
      subject: `${code} es tu código de acceso a ${APP_NAME}`,
      text: `Tu código de acceso a ${APP_NAME} es:\n\n${code}\n\nEscribilo en la pantalla de ingreso. Vence en 10 minutos.\n\nSi no solicitaste este acceso, ignora este correo.`,
      html: loginCodeEmailHtml(code),
    });
  } catch (error) {
    logError("[mailer] failed to send login code", error);
    throw error;
  }
}

function loginCodeEmailHtml(code: string) {
  const font = "Poppins, 'Helvetica Neue', Arial, sans-serif";
  const logoUrl = `${appEnv.portalBaseUrl}/basket-tv-horizontal-blanco.png`;
  const digits = code
    .split("")
    .map(
      (digit) =>
        `<td style="width:44px;height:56px;border:1px solid #e7e4e2;border-radius:10px;background:#faf9f8;font-family:${font};font-size:28px;font-weight:700;color:#1c0d10;text-align:center;vertical-align:middle">${digit}</td>`,
    )
    .join('<td style="width:6px"></td>');

  return `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f2f1">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f1;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e4e2">
            <tr>
              <td style="background:#e31b23;padding:24px 32px">
                <img src="${logoUrl}" alt="Basket.tv" width="140" style="display:block;width:140px;height:auto;border:0" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px;font-family:${font}">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#e31b23">Código de acceso</p>
                <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#1c0d10">Ingresá a ${APP_NAME}</h1>
                <p style="margin:0;font-size:15px;line-height:1.5;color:#4a423f">Escribí este código en la pantalla de ingreso:</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 32px">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;font-family:${font}">
                <p style="margin:0;font-size:13px;color:#6b615f">Vence en 10 minutos.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#faf9f8;border-top:1px solid #e7e4e2;font-family:${font}">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#847b78">Si no solicitaste este acceso, ignorá este correo.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendCollaboratorInviteEmail({
  to,
  loginUrl,
  appName = APP_NAME,
}: {
  to: string;
  loginUrl: string;
  appName?: string;
}) {
  try {
    await getTransport().sendMail({
      from: appEnv.mailFrom,
      to,
      subject: `Tienes acceso a ${appName}`,
      text: `Se habilitó tu acceso a ${appName}.\n\nIngresa desde:\n${loginUrl}\n\nUsa tu correo para recibir un enlace de acceso, o inicia sesión con Google si tu cuenta lo permite.`,
      html: `
        <p>Se habilitó tu acceso a <strong>${appName}</strong>.</p>
        <p><a href="${loginUrl}">Ir a la plataforma</a></p>
        <p style="color:#666;font-size:13px">Usa tu correo para recibir un enlace de acceso, o inicia sesión con Google si tu cuenta lo permite.</p>
      `,
    });
  } catch (error) {
    logError("[mailer] failed to send collaborator invite", error);
    throw error;
  }
}

export async function sendUseExistingAccountEmail({
  to,
  existingEmail,
  loginUrl,
  appName = APP_NAME,
}: {
  to: string;
  existingEmail: string;
  loginUrl: string;
  appName?: string;
}) {
  try {
    await getTransport().sendMail({
      from: appEnv.mailFrom,
      to,
      subject: `Tu acceso a ${appName} está en otra cuenta`,
      text: `Ya tenés acceso a ${appName} con la cuenta ${existingEmail}.\n\nIngresá con ese correo desde:\n${loginUrl}\n\nNo hace falta pedir acceso de nuevo.`,
      html: `
        <p>Ya tenés acceso a <strong>${appName}</strong> con la cuenta <strong>${existingEmail}</strong>.</p>
        <p><a href="${loginUrl}">Ingresar con ese correo</a></p>
        <p style="color:#666;font-size:13px">No hace falta pedir acceso de nuevo.</p>
      `,
    });
  } catch (error) {
    logError("[mailer] failed to send use-existing-account email", error);
    throw error;
  }
}

export async function sendMatchNotificationEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  try {
    await getTransport().sendMail({
      from: appEnv.mailFrom,
      to,
      subject,
      text,
    });
  } catch (error) {
    logError("[mailer] failed to send match notification", error);
    throw error;
  }
}

export async function sendFixturesSyncAlertEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  try {
    await getTransport().sendMail({
      from: appEnv.mailFrom,
      to,
      subject,
      text,
    });
  } catch (error) {
    logError("[mailer] failed to send fixtures sync alert", error);
    throw error;
  }
}

export async function sendAccessRequestEmail({
  to,
  request,
  reviewUrl,
}: {
  to: string;
  request: {
    appLabel: string;
    fullName: string;
    email: string;
    phone: string;
    funcion: string | null;
    ciudad: string | null;
    mensaje: string | null;
  };
  reviewUrl: string;
}) {
  const lines = [
    `${request.fullName} pidió acceso a ${request.appLabel}.`,
    "",
    request.funcion ? `Función: ${request.funcion}` : null,
    `Correo: ${request.email}`,
    `Teléfono: ${request.phone}`,
    request.ciudad ? `Ciudad: ${request.ciudad}` : null,
    request.mensaje ? `Mensaje: ${request.mensaje}` : null,
    "",
    `Aprobá o rechazá la solicitud desde acá: ${reviewUrl}`,
  ].filter((line) => line !== null);

  try {
    await getTransport().sendMail({
      from: appEnv.mailFrom,
      to,
      subject: `Nueva solicitud de acceso a ${request.appLabel}: ${request.fullName}${
        request.funcion ? ` (${request.funcion})` : ""
      }`,
      text: lines.join("\n"),
    });
  } catch (error) {
    logError("[mailer] failed to send access request notice", error);
    throw error;
  }
}
