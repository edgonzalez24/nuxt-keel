export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} with id ${id} not found`)
  }
}

export class UnauthorizedError extends DomainError {
  constructor() {
    super('Authentication required')
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Insufficient permissions') {
    super(message)
  }
}

export class ConflictError extends DomainError {
  constructor(field: string, message: string) {
    super(`${field}: ${message}`)
  }
}

export class ValidationError extends DomainError {
  constructor(field: string, message: string) {
    super(`${field}: ${message}`)
  }
}
