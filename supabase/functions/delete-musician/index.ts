import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    if (!isAdmin) return response({ message: "Only administrators can delete musicians." }, 403);

    const body = await request.json();
    if (typeof body?.musician_id !== "string" || !body.musician_id) {
      return response({ message: "A musician ID is required." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: musician, error: musicianError } = await admin
      .from("musicians")
      .select("id")
      .eq("id", body.musician_id)
      .maybeSingle();
    if (musicianError) throw musicianError;
    if (!musician) return response({ message: "Musician not found." }, 404);

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id,role")
      .eq("musician_id", musician.id);
    if (profilesError) throw profilesError;
    if ((profiles || []).length > 1) {
      return response({ message: "This musician is linked to multiple accounts. Resolve the account links before deleting." }, 409);
    }

    const linkedProfile = profiles?.[0];
    if (linkedProfile?.role === "admin") {
      return response({ message: "Administrators' musician profiles cannot be deleted. Change the account role first." }, 409);
    }

    if (linkedProfile) {
      const { error: accountError } = await admin.auth.admin.deleteUser(linkedProfile.id);
      if (accountError) throw new Error(`The linked login account could not be deleted: ${accountError.message}`);
    }

    const { error: assignmentsError } = await admin
      .from("schedule_assignments")
      .delete()
      .eq("musician_id", musician.id);
    if (assignmentsError) {
      const prefix = linkedProfile ? "The login account was deleted, but" : "The";
      return response({ message: `${prefix} musician's lineup assignments could not be removed: ${assignmentsError.message}` }, 500);
    }

    const { data: deletedMusician, error: deleteError } = await admin
      .from("musicians")
      .delete()
      .eq("id", musician.id)
      .select("id")
      .maybeSingle();
    if (deleteError) {
      const prefix = linkedProfile ? "The login account was deleted, but" : "The";
      return response({ message: `${prefix} musician could not be deleted: ${deleteError.message}` }, 500);
    }
    if (!deletedMusician) {
      const prefix = linkedProfile ? "The login account was deleted, but" : "The";
      return response({ message: `${prefix} musician no longer exists.` }, 404);
    }

    return response({
      message: linkedProfile
        ? "Musician and linked login account deleted."
        : "Musician deleted. No linked login account was found.",
    });
  } catch (error) {
    console.error("Delete musician request failed:", error);
    return response({
      message: error instanceof Error ? error.message : "Musician deletion failed.",
    }, 500);
  }
});
