import { redditUrl } from "./util";

export interface AlertLead {
  title: string;
  subreddit: string; // display label, already platform-qualified (e.g. "r/LocalLLaMA", "HN")
  permalink: string;
  intentScore: number;
  summary: string | null;
  monitorName: string;
  monitorKind: string;
  leadUrl: string; // link back into Reddit Sonar
}

/**
 * Slack Incoming Webhook alert. Add other channels (email via Resend, Teams,
 * Discord) here — the poller calls sendAlert for every lead over the threshold.
 */
export async function sendAlert(webhook: string, lead: AlertLead): Promise<boolean> {
  if (!webhook) return false;
  const label = lead.monitorKind === "LEAD" ? "🔥 Hot lead" : lead.monitorKind === "BRAND" ? "🗣️ Brand mention" : "🎯 Competitor opening";
  const payload = {
    text: `${label} (${lead.intentScore}) in ${lead.subreddit}: ${lead.title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${label} · score ${lead.intentScore}* — _${lead.monitorName}_\n<${redditUrl(lead.permalink)}|${escapeSlack(lead.title)}> in ${lead.subreddit}`,
        },
      },
      ...(lead.summary
        ? [{ type: "context", elements: [{ type: "mrkdwn", text: escapeSlack(lead.summary) }] }]
        : []),
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Open in Sonar" }, url: lead.leadUrl },
          { type: "button", text: { type: "plain_text", text: "View on Reddit" }, url: redditUrl(lead.permalink) },
        ],
      },
    ],
  };
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("[alerts] Slack webhook failed:", err);
    return false;
  }
}

function escapeSlack(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
