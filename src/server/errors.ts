export class ForbiddenError extends Error {
  status = 403;
  constructor(public permission?: string) {
    super(
      permission ? `You do not have permission (${permission}).` : 'You do not have permission to do that.',
    );
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor() {
    super('Please sign in.');
    this.name = 'UnauthorizedError';
  }
}

/** An error whose message is safe to show to the user. */
export class UserError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export class NotFoundError extends Error {
  status = 404;
  constructor(what = 'Record') {
    super(`${what} not found.`);
    this.name = 'NotFoundError';
  }
}

export function httpStatusOf(e: unknown): number {
  if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number') {
    return (e as { status: number }).status;
  }
  return 500;
}
