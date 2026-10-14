export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    console.log("wiggle_trial_feedback", JSON.stringify({
      visitor_id: data.visitor_id || "",
      mode: data.mode || "",
      rating: data.rating || 0,
      text: String(data.text || "").slice(0, 500),
      ts: data.ts || new Date().toISOString()
    }));
  } catch (error) {
    console.log("wiggle_trial_feedback_parse_error", String(error));
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

