// Mails the backup report to BACKUP_ALERT_TO through the Portal's SMTP. The
// subject comes as the only argument, the body on stdin.
//
//   node --env-file=/opt/basket-app/.env.local scripts/backup/notify.mjs "<subject>" < report.txt
import { text } from "node:stream/consumers";

import nodemailer from "nodemailer";

const [subject] = process.argv.slice(2);
const { BACKUP_ALERT_TO, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

if (!subject || !BACKUP_ALERT_TO || !SMTP_HOST || !MAIL_FROM) {
  console.error("[backup-notify] missing subject, BACKUP_ALERT_TO or SMTP settings; not sent");
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 587),
  secure: false, // STARTTLS on 587
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

await transport.sendMail({
  from: MAIL_FROM,
  to: BACKUP_ALERT_TO,
  subject,
  text: await text(process.stdin),
});
console.info(`[backup-notify] sent "${subject}" to ${BACKUP_ALERT_TO}`);
