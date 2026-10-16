import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Assignment = {
  schedule_id: string;
  musician_id: string;
  positions: { name: string } | null;
  musicians: { name: string } | null;
};

type Schedule = {
  id: string;
  title: string;
  service_date: string;
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

function formatServiceDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function sendEmail(to: string, subject: string, text: string, html: string) {
  const scriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
  const sharedSecret = Deno.env.get("GOOGLE_APPS_SCRIPT_SECRET");
  if (!scriptUrl || !sharedSecret) {
    throw new Error("Email service is not configured. Set GOOGLE_APPS_SCRIPT_URL and GOOGLE_APPS_SCRIPT_SECRET.");
  }

  const result = await fetch(scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: sharedSecret, to, subject, text, html }),
  });
  if (!result.ok) {
    const detail = (await result.text()).slice(0, 300);
    throw new Error(`Google Apps Script returned ${result.status}: ${detail}`);
  }
  const delivery = await result.json();
  if (delivery?.ok !== true) {
    throw new Error(delivery?.error || "Google Apps Script did not confirm email delivery.");
  }
}

async function sendScheduleEmails(
  admin: ReturnType<typeof createClient>,
  schedule: Schedule,
  assignments: Assignment[],
  emailType: "assignment" | "reminder",
) {
  const musicianIds = [...new Set(assignments.map((assignment) => assignment.musician_id))];
  if (!musicianIds.length) return { sent: 0, skipped: 0, failures: [] };

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("musician_id,name,email")
    .eq("status", "active")
    .in("musician_id", musicianIds);
  if (profilesError) throw profilesError;

  const profilesByMusician = new Map<string, typeof profiles>();
  for (const profile of profiles || []) {
    const current = profilesByMusician.get(profile.musician_id) || [];
    current.push(profile);
    profilesByMusician.set(profile.musician_id, current);
  }

  let sent = 0;
  let skipped = 0;
  const failures: { musician: string; error: string }[] = [];
  for (const musicianId of musicianIds) {
    const musicianAssignments = assignments.filter((item) => item.musician_id === musicianId);
    const musicianName = musicianAssignments[0]?.musicians?.name || "Musician";
    const recipientProfiles = profilesByMusician.get(musicianId) || [];
    if (!recipientProfiles.some((profile) => profile.email)) {
      failures.push({ musician: musicianName, error: "No active account with an email address is linked to this musician." });
      continue;
    }

    const positions = [...new Set(musicianAssignments.map((item) => item.positions?.name).filter(Boolean))];
    const date = formatServiceDate(schedule.service_date);
    const subject = emailType === "reminder"
      ? `Reminder: you're scheduled for ${schedule.title} tomorrow`
      : `You're scheduled for ${schedule.title}`;
    const intro = emailType === "reminder"
      ? "This is a reminder that you are scheduled to serve tomorrow."
      : "You have been assigned to an upcoming worship service.";
    const text = `Hi ${musicianName},\n\n${intro}\n\nService: ${schedule.title}\nDate: ${date}\nYour position${positions.length === 1 ? "" : "s"}: ${positions.join(", ") || "Assigned musician"}\n\nWorshipFlow`;
    const html = `<p>Hi ${escapeHtml(musicianName)},</p><p>${escapeHtml(intro)}</p><p><strong>Service:</strong> ${escapeHtml(schedule.title)}<br><strong>Date:</strong> ${escapeHtml(date)}<br><strong>Your position${positions.length === 1 ? "" : "s"}:</strong> ${escapeHtml(positions.join(", ") || "Assigned musician")}</p><p>WorshipFlow</p>`;

    for (const profile of recipientProfiles.filter((item) => item.email)) {
      let reminderClaimed = false;
      if (emailType === "reminder") {
        const { error: claimError } = await admin
          .from("schedule_email_reminders")
          .insert({
            schedule_id: schedule.id,
            musician_id: musicianId,
            recipient_email: profile.email,
            service_date: schedule.service_date,
          });
        if (claimError?.code === "23505") {
          skipped++;
          continue;
        }
        if (claimError) {
          failures.push({ musician: musicianName, error: claimError.message });
          continue;
        }
        reminderClaimed = true;
      }

      try {
        await sendEmail(profile.email, subject, text, html);
        sent++;
      } catch (error) {
        if (reminderClaimed) {
          const { error: releaseError } = await admin
            .from("schedule_email_reminders")
            .delete()
            .eq("schedule_id", schedule.id)
            .eq("musician_id", musicianId)
            .eq("recipient_email", profile.email)
            .eq("service_date", schedule.service_date);
          if (releaseError) console.error("Unable to release failed reminder claim:", releaseError);
        }
        failures.push({
          musician: musicianName,
          error: error instanceof Error ? error.message : "Email delivery failed.",
        });
      }
    }
  }
  return { sent, skipped, failures };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return response({ message: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Supabase function environment is not configured.");
    }

    const body = await request.json();
    if (body?.type === "daily_reminders") {
      const cronSecret = Deno.env.get("SCHEDULE_EMAIL_CRON_SECRET");
      if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
        return response({ message: "Unauthorized." }, 401);
      }

      const timeZone = Deno.env.get("SCHEDULE_TIME_ZONE") || "UTC";
      const today = dateInTimeZone(new Date(), timeZone);
      const tomorrow = new Date(`${today}T12:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const serviceDate = tomorrow.toISOString().slice(0, 10);
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: schedules, error: schedulesError } = await admin
        .from("schedules")
        .select("id,title,service_date")
        .eq("service_date", serviceDate);
      if (schedulesError) throw schedulesError;

      let sent = 0;
      let skipped = 0;
      const failures: { musician: string; error: string }[] = [];
      for (const schedule of (schedules || []) as Schedule[]) {
        const { data: assignments, error: assignmentsError } = await admin
          .from("schedule_assignments")
          .select("schedule_id,musician_id,positions(name),musicians(name)")
          .eq("schedule_id", schedule.id);
        if (assignmentsError) throw assignmentsError;
        const result = await sendScheduleEmails(admin, schedule, (assignments || []) as Assignment[], "reminder");
        sent += result.sent;
        skipped += result.skipped;
        failures.push(...result.failures);
      }
      return response({
        sent,
        skipped,
        failures,
        message: `Sent ${sent} reminder email${sent === 1 ? "" : "s"}.`,
      }, failures.length ? 207 : 200);
    }

    if (body?.type !== "assignment" || typeof body.schedule_id !== "string") {
      return response({ message: "A valid assignment request is required." }, 400);
    }
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return response({ message: "Unauthorized." }, 401);
    const accessToken = authorization.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user) return response({ message: "Unauthorized." }, 401);
    const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");
    if (adminError) throw adminError;
    if (!isAdmin) return response({ message: "Only administrators can send schedule emails." }, 403);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: schedule, error: scheduleError } = await admin
      .from("schedules")
      .select("id,title,service_date")
      .eq("id", body.schedule_id)
      .single();
    if (scheduleError) throw scheduleError;
    const { data: assignments, error: assignmentsError } = await admin
      .from("schedule_assignments")
      .select("schedule_id,musician_id,positions(name),musicians(name)")
      .eq("schedule_id", schedule.id);
    if (assignmentsError) throw assignmentsError;

    const requestedIds = Array.isArray(body.musician_ids)
      ? new Set(body.musician_ids.filter((id: unknown) => typeof id === "string"))
      : null;
    const recipients = ((assignments || []) as Assignment[])
      .filter((assignment) => !requestedIds || requestedIds.has(assignment.musician_id));
    const result = await sendScheduleEmails(admin, schedule as Schedule, recipients, "assignment");
    return response({
      ...result,
      message: result.failures.length
        ? `Sent ${result.sent} assignment email${result.sent === 1 ? "" : "s"}; ${result.failures.length} failed.`
        : `Sent ${result.sent} assignment email${result.sent === 1 ? "" : "s"}.`,
    }, result.failures.length ? 207 : 200);
  } catch (error) {
    console.error("Schedule email request failed:", error);
    return response({
      message: error instanceof Error ? error.message : "Schedule email request failed.",
    }, 500);
  }
});
