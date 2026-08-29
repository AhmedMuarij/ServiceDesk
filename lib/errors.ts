/**
 * Dependency-free on purpose. These are thrown by server code and matched by
 * lib/actions.ts; keeping them out of scope.ts stops the auth/Prisma/pg chain
 * being pulled into anything that only needs the error type.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** A tenant-scoped lookup that found nothing. Always rendered as a 404. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
