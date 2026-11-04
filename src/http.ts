/** The responses a connector's routes answer with. */

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export const fail = (error: string, status = 400) => json({ error }, status);

/** A bare page for what only a browser opens: a consent's outcome, a QR code. `body` is html, escaped by the caller. */
export const page = (body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:32rem">${body}</body>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
