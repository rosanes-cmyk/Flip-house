// Report delivery. Cloudflare Workers cannot open raw SMTP sockets, so email is
// sent via Resend's HTTP API (free tier: 3,000 emails/month). If no RESEND_API_KEY
// is configured, the report is logged and still saved to the database + returned
// from the /run endpoint, so nothing is lost.
export async function deliverReport({ subject, body, env }) {
  const to = env.REPORT_EMAIL_TO;
  const key = env.RESEND_API_KEY;

  if (!key || !to) {
    console.log("=== DAILY REPORT (email not configured) ===");
    console.log("Subject:", subject);
    console.log(body);
    console.log("=== END REPORT ===");
    return { sent: false, reason: "RESEND_API_KEY or REPORT_EMAIL_TO not set" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.REPORT_EMAIL_FROM || "Flip Scout <onboarding@resend.dev>",
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`Resend failed ${res.status}: ${t}`);
      return { sent: false, reason: `Resend ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("email error:", e.message);
    return { sent: false, reason: e.message };
  }
}
