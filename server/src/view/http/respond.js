// The section 4 envelope, in one file. Every success answer is
// { success: true, data } with its status; every error answer is
// { success: false, error: { code, message, details } }. Routes answer through
// ok, created, accepted and noContent; only middleware/errorHandler.js calls
// fail. The client's http.js unwraps exactly this shape.

/** 200 OK: the request worked and `data` is the answer. */
export const ok = (res, data) => res.status(200).json({ success: true, data });

/** 201 Created: a new resource, such as an account or a deposit. */
export const created = (res, data) => res.status(201).json({ success: true, data });

/** 202 Accepted: taken for processing, such as an order the engine will match. */
export const accepted = (res, data) => res.status(202).json({ success: true, data });

/** 204 No Content: done, with nothing to send back (no body, so no envelope). */
export const noContent = (res) => res.status(204).end();

/** An error envelope. `details` is left out of the JSON when it is undefined. */
export const fail = (res, status, { code, message, details }) =>
  res.status(status).json({ success: false, error: { code, message, details } });
