import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const appUrl = "https://pickleflow.paotechs.com";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function brandedEmail({ preview, heading, message, details, buttonLabel = "Open PickleFlow", buttonUrl = appUrl }: {
  preview: string;
  heading: string;
  message: string;
  details?: Array<[string, string]>;
  buttonLabel?: string;
  buttonUrl?: string;
}) {
  const detailRows = details?.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#f3f7fb;border-radius:12px">${details.map(([label, value]) => `<tr><td style="padding:10px 14px;color:#65778a;font-size:13px">${escapeHtml(label)}</td><td align="right" style="padding:10px 14px;color:#10243e;font-size:13px;font-weight:700">${escapeHtml(value)}</td></tr>`).join("")}</table>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(heading)}</title></head><body style="margin:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#10243e"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fb"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dbe6ef;border-radius:20px;overflow:hidden"><tr><td style="padding:28px 32px;background:#102f51;color:#fff"><div style="font-size:25px;font-weight:800">PickleFlow</div><div style="margin-top:5px;color:#b9daf7;font-size:13px">Smarter pickleball event management</div></td></tr><tr><td style="padding:34px 32px"><h1 style="margin:0 0 14px;font-size:26px;line-height:1.25">${escapeHtml(heading)}</h1><p style="margin:0;color:#526579;line-height:1.65">${escapeHtml(message)}</p>${detailRows}<a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:14px 22px;border-radius:11px;background:#2375d8;color:#fff;font-weight:700;text-decoration:none">${escapeHtml(buttonLabel)}</a></td></tr><tr><td style="padding:22px 32px;border-top:1px solid #e3ebf2;color:#708197;font-size:12px;line-height:1.55"><strong style="color:#10243e">PickleFlow by PAOTECHS</strong><br>Registration, live scoring, queues, and match boards in one place.</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const from = Deno.env.get("PICKLEFLOW_FROM_EMAIL") || "PickleFlow <hello@send.paotechs.com>";
    const replyTo = Deno.env.get("PICKLEFLOW_REPLY_TO") || "hello@paotechs.com";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    const body = await req.json();
    const { data: adminRecord } = await admin.from("platform_admins").select("email").ilike("email", user.email).maybeSingle();
    const isAdmin = Boolean(adminRecord);

    let recipient = "";
    let eventKey = "";
    let subject = "";
    let html = "";

    if (["upgrade_received", "upgrade_reviewed"].includes(body.type)) {
      const { data: item, error } = await admin.from("active_event_upgrade_requests").select("*").eq("id", body.requestId).single();
      if (error || !item) throw new Error("Upgrade request not found");
      if (item.organizer_user_id !== user.id && !isAdmin) return new Response("Forbidden", { status: 403, headers: corsHeaders });
      const { data: account } = await admin.auth.admin.getUserById(item.organizer_user_id);
      recipient = account.user?.email || "";
      const provider = item.payment_provider === "paypal" ? "PayPal" : String(item.payment_provider).toUpperCase();
      const amount = item.payment_provider === "paypal" ? `$${Number(item.donation_amount_usd).toFixed(2)} USD` : `₱${Number(item.donation_amount_php).toLocaleString()} PHP`;
      if (body.type === "upgrade_received") {
        eventKey = `upgrade_received:${item.id}`;
        subject = item.payment_provider === "paypal" ? "Payment received — PickleFlow event allowance" : "Payment proof received — PickleFlow event allowance";
        html = brandedEmail({ preview: subject, heading: item.payment_provider === "paypal" ? "Your payment was received" : "Your payment proof is in review", message: `We received your request for ${item.requested_events} additional active events. Platform Admin will review it and notify you when the allowance is updated.`, details: [["Payment method", provider], ["Amount", amount], ["Request status", "Pending review"]], buttonLabel: "View organizer dashboard" });
      } else {
        if (!isAdmin) return new Response("Forbidden", { status: 403, headers: corsHeaders });
        eventKey = `upgrade_reviewed:${item.id}:${item.status}`;
        subject = item.status === "approved" ? "Approved — your PickleFlow event allowance increased" : "Update on your PickleFlow allowance request";
        html = brandedEmail({ preview: subject, heading: item.status === "approved" ? `You now have ${item.requested_events} more active events` : "Your allowance request was declined", message: item.status === "approved" ? "Your payment has been confirmed and the additional active events are available now." : "Platform Admin reviewed your request. Contact support if you would like us to take another look.", details: [["Payment method", provider], ["Amount", amount], ["Status", item.status]], buttonLabel: "Open PickleFlow" });
      }
    } else if (["suggestion_received", "suggestion_status"].includes(body.type)) {
      const { data: item, error } = await admin.from("app_improvement_suggestions").select("*").eq("id", body.suggestionId).single();
      if (error || !item) throw new Error("Suggestion not found");
      if (item.organizer_user_id !== user.id && !isAdmin) return new Response("Forbidden", { status: 403, headers: corsHeaders });
      const { data: account } = await admin.auth.admin.getUserById(item.organizer_user_id);
      recipient = account.user?.email || "";
      if (body.type === "suggestion_received") {
        eventKey = `suggestion_received:${item.id}`;
        const donated = item.payment_provider !== "later";
        subject = donated ? "Donation and suggestion received — PickleFlow" : "Suggestion received — PickleFlow backlog";
        html = brandedEmail({ preview: subject, heading: "Your suggestion is in the backlog", message: donated ? "Thank you for supporting PickleFlow. We received your suggestion and will review it with the product backlog." : "Thanks for sharing your idea. You chose to donate later, and your suggestion has still been added to the product backlog.", details: [["Suggestion", item.title], ["Status", "Backlog"], ["Support", donated ? String(item.payment_provider).toUpperCase() : "Donate later"]], buttonLabel: "View PickleFlow" });
      } else {
        if (!isAdmin) return new Response("Forbidden", { status: 403, headers: corsHeaders });
        eventKey = `suggestion_status:${item.id}:${item.status}`;
        subject = `Suggestion update — ${item.status}`;
        html = brandedEmail({ preview: subject, heading: "Your suggestion has an update", message: "Platform Admin updated the status of your PickleFlow suggestion.", details: [["Suggestion", item.title], ["Status", item.status]], buttonLabel: "Open PickleFlow" });
      }
    } else {
      return new Response("Unsupported notification", { status: 400, headers: corsHeaders });
    }

    if (!recipient) throw new Error("Recipient email not found");
    const { error: claimError } = await admin.from("email_notification_deliveries").insert({ event_key: eventKey, recipient, notification_type: body.type });
    if (claimError?.code === "23505") return Response.json({ sent: false, duplicate: true }, { headers: corsHeaders });
    if (claimError) throw claimError;

    const resendResponse = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient], reply_to: replyTo, subject, html }) });
    const result = await resendResponse.json();
    if (!resendResponse.ok) {
      await admin.from("email_notification_deliveries").delete().eq("event_key", eventKey);
      throw new Error(result.message || "Resend rejected the email");
    }
    await admin.from("email_notification_deliveries").update({ provider_message_id: result.id }).eq("event_key", eventKey);
    return Response.json({ sent: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Notification failed" }, { status: 500, headers: corsHeaders });
  }
});
