// How a validation rule carries its answer. Each rule's message holds two
// things, "code|sentence": the code goes into the answer's details (one per
// field), and the sentence is for the person.

export const rule = (code, sentence) => `${code}|${sentence}`;

/**
 * A ZodError as { message, details }: the first problem of each field, and the
 * sentence of the first of them. The client shows that sentence beside the first
 * field the details name, so both follow the schema's order.
 */
export function fieldErrors(zodError) {
  const details = {};
  let message;
  for (const issue of zodError.issues) {
    const field = issue.path.join('.') || 'body';
    const bar = issue.message.indexOf('|');
    const [code, sentence] = bar < 0
      ? [issue.code, 'The request isn\'t valid.']
      : [issue.message.slice(0, bar), issue.message.slice(bar + 1)];
    details[field] ??= code;
    message ??= sentence;
  }
  return { message, details };
}
