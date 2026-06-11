import "server-only";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import { appEnv, assertSmtpEnv } from "@/lib/env";

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

const APP_NAME = "Basket-App";

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
    console.error("[mailer] failed to send magic link", error);
    throw error;
  }
}

export async function sendCollaboratorInviteEmail({
  to,
  loginUrl,
}: {
  to: string;
  loginUrl: string;
}) {
  try {
    await getTransport().sendMail({
      from: appEnv.mailFrom,
      to,
      subject: `Tienes acceso a ${APP_NAME}`,
      text: `Se habilitó tu acceso a ${APP_NAME}.\n\nIngresa desde:\n${loginUrl}\n\nUsa tu correo para recibir un enlace de acceso, o inicia sesión con Google si tu cuenta lo permite.`,
      html: `
        <p>Se habilitó tu acceso a <strong>${APP_NAME}</strong>.</p>
        <p><a href="${loginUrl}">Ir a la plataforma</a></p>
        <p style="color:#666;font-size:13px">Usa tu correo para recibir un enlace de acceso, o inicia sesión con Google si tu cuenta lo permite.</p>
      `,
    });
  } catch (error) {
    console.error("[mailer] failed to send collaborator invite", error);
    throw error;
  }
}
