export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const event = {
      event: data.event || "",
      visitor_id: data.visitor_id || "",
      session_id: data.session_id || "",
      mode: data.mode || "",
      ts: data.ts || new Date().toISOString(),
      source: data.source || {},
      payload: data.payload || {}
    };
    console.log("wiggle_trial_event", JSON.stringify(event));

    if (context.env && context.env.DB && typeof context.env.DB.prepare === "function") {
      await context.env.DB.prepare(
        "INSERT INTO events (event_ts, visitor_id, session_id, event, mode, source_json, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        event.ts,
        event.visitor_id,
        event.session_id,
        event.event,
        event.mode,
        JSON.stringify(event.source),
        JSON.stringify(event.payload)
      ).run();
    }
  } catch (error) {
    console.log("wiggle_trial_event_parse_error", String(error));
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, name: "wiggle-trial-events" }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
