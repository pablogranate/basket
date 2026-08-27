import { parsed, type ParseResult } from "@/lib/actions/define-action";

export function resolveMatchRedirect(formData: FormData) {
  return `/match/${String(formData.get("matchId") ?? "")}`;
}

export type SendAllMatchNotificationsInput = { matchId: string };

export function parseSendAllMatchNotifications(
  formData: FormData,
): ParseResult<SendAllMatchNotificationsInput> {
  return parsed({ matchId: String(formData.get("matchId") ?? "") });
}

export type SendAssignmentNotificationsInput = {
  matchId: string;
  assignmentIds: string[];
};

export function parseSendAssignmentNotifications(
  formData: FormData,
): ParseResult<SendAssignmentNotificationsInput> {
  return parsed({
    matchId: String(formData.get("matchId") ?? ""),
    assignmentIds: String(formData.get("assignmentIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  });
}
