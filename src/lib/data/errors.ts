/**
 * An error a person or an assistant can act on. Tools return its message as a
 * normal tool error; anything else becomes a generic failure, so a stack trace
 * never reaches a client.
 */
export class UserError extends Error {}

export function notFound(what: string): never {
  throw new UserError(`No ${what} with that id in this workspace.`);
}
