import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { DecodeError } from "@stellar-reqpay/sdk";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorHandler(
  err: FastifyError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  let status = 500;
  let code = "INTERNAL";
  let message = "internal server error";
  let details: unknown;
  if (err instanceof HttpError) ({ status, code, message, details } = err);
  else if (err instanceof DecodeError) {
    status = 400;
    code = "INVALID_REQUEST";
    message = err.message;
    details = err.details;
  } else if (hasZodFastifySchemaValidationErrors(err)) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "request failed validation";
    details = err.validation.map((v) => ({ path: v.instancePath, message: v.message }));
  } else if (isResponseSerializationError(err)) {
    code = "RESPONSE_SERIALIZATION";
    message = "response did not match schema";
  } else if ("statusCode" in err && typeof err.statusCode === "number" && err.statusCode < 500) {
    status = err.statusCode;
    code = ("code" in err && typeof err.code === "string" && err.code) || "BAD_REQUEST";
    message = err.message;
  }
  if (status >= 500) req.log.error({ err, requestId: req.id }, "request failed");
  else req.log.info({ code, requestId: req.id }, "request rejected");
  void reply.status(status).send({
    error: { code, message, requestId: req.id, ...(details !== undefined ? { details } : {}) },
  });
}
