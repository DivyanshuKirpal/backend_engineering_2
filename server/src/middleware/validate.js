// Checks a request against its Zod schemas before the handler sees it:
// validate({ body, query, params }). The parsed values (trimmed, lower-cased,
// unknown keys dropped) go on req.input, since req.query is read-only in Express
// 5; the adapter hands them to the handler. A request that doesn't fit throws a
// ZodError, which errorHandler.js answers with a 400 and one detail per field.

export const validate = (schemas) => (req, res, next) => {
  req.input = Object.fromEntries(Object.entries(schemas).map(([part, schema]) => [part, schema.parse(req[part] ?? {})]));
  next();
};
