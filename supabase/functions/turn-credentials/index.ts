import { createClient } from "npm:@supabase/supabase-js@2"

const TURN_TTL_SECONDS = 86400

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405)
  }

  try {
    const authorization = req.headers.get("Authorization") || ""
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i)

    if (!tokenMatch) {
      return jsonResponse({ error: "Authentication required." }, 401)
    }

    const accessToken = tokenMatch[1]
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      ""

    const turnKeyId = Deno.env.get("CF_TURN_KEY_ID") || ""
    const turnApiToken = Deno.env.get("CF_TURN_API_TOKEN") || ""

    if (!supabaseUrl || !supabaseKey || !turnKeyId || !turnApiToken) {
      console.error("TURN function server configuration is incomplete.")
      return jsonResponse({ error: "Call service is not configured." }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { Authorization: authorization },
      },
    })

    const { data: userData, error: userError } =
      await supabase.auth.getUser(accessToken)

    if (userError || !userData.user) {
      return jsonResponse({ error: "Invalid or expired session." }, 401)
    }

    let body: { callId?: string }

    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: "Invalid request body." }, 400)
    }

    const callId = body?.callId

    if (
      typeof callId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(callId)
    ) {
      return jsonResponse({ error: "A valid call ID is required." }, 400)
    }

    const { data: callSession, error: callError } = await supabase
      .from("call_sessions")
      .select("id, status, caller_id, callee_id")
      .eq("id", callId)
      .maybeSingle()

    if (callError) {
      console.error("Call authorization query failed:", callError.message)
      return jsonResponse({ error: "Unable to verify call access." }, 500)
    }

    const userId = userData.user.id
    if (
      !callSession ||
      (callSession.caller_id !== userId && callSession.callee_id !== userId) ||
      callSession.status !== "accepted"
    ) {
      return jsonResponse(
        { error: "TURN credentials are only available to participants in an accepted call." },
        403,
      )
    }

    const cloudflareResponse = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${turnApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
      },
    )

    if (!cloudflareResponse.ok) {
      console.error(
        "Cloudflare TURN credential request failed:",
        cloudflareResponse.status,
      )
      return jsonResponse({ error: "Unable to obtain call network credentials." }, 502)
    }

    const turnData = await cloudflareResponse.json()

    if (!Array.isArray(turnData?.iceServers) || turnData.iceServers.length === 0) {
      console.error("Cloudflare returned an invalid ICE server response.")
      return jsonResponse({ error: "Invalid TURN service response." }, 502)
    }

    return jsonResponse({
      iceServers: turnData.iceServers,
      expiresIn: TURN_TTL_SECONDS,
    })
  } catch (error) {
    console.error("TURN credentials function error:", error)
    return jsonResponse({ error: "Unable to prepare call connection." }, 500)
  }
})
