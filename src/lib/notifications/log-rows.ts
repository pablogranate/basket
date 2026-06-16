export type NotificationTrigger = "cron" | "catchup" | "boot" | "manual";
export type NotificationChannel = "whatsapp" | "email" | "none";
export type NotificationStatus = "sent" | "failed" | "skipped" | "no_contact";

export type ChannelOutcome = {
  channel: "whatsapp" | "email";
  attempted: boolean;
  ok: boolean;
  error?: string | null;
};

export type RecipientLogInput = {
  match: { id: string | null; label: string };
  trigger: NotificationTrigger;
  recipient: {
    personId: string | null;
    personName: string;
    phone: string | null;
    email: string | null;
    roleNames: string[];
  };
  outcomes: ChannelOutcome[];
};

export type NotificationLogRow = {
  match_id: string | null;
  person_id: string | null;
  match_label: string;
  recipient_name: string;
  role_names: string[];
  channel: NotificationChannel;
  destination: string | null;
  status: NotificationStatus;
  error: string | null;
  trigger: NotificationTrigger;
};

export function buildRecipientLogRows(
  input: RecipientLogInput,
): NotificationLogRow[] {
  const { match, trigger, recipient, outcomes } = input;

  const base = {
    match_id: match.id,
    person_id: recipient.personId,
    match_label: match.label,
    recipient_name: recipient.personName,
    role_names: recipient.roleNames,
    trigger,
  };

  if (outcomes.length === 0) {
    return [
      {
        ...base,
        channel: "none",
        destination: null,
        status: "no_contact",
        error: null,
      },
    ];
  }

  return outcomes.map((outcome) => ({
    ...base,
    channel: outcome.channel,
    destination: outcome.channel === "whatsapp" ? recipient.phone : recipient.email,
    status: !outcome.attempted ? "skipped" : outcome.ok ? "sent" : "failed",
    error: outcome.ok ? null : outcome.error ?? null,
  }));
}
