import { AppError, type AppErrorCode } from "./AppError.js";

export function createAppError(options: {
    code: AppErrorCode;
    statusCode: number;
    message: string;
    details?: unknown;
}) {
    return new AppError(options);
}

export function notFound(code: AppErrorCode, message: string, details?: unknown) {
    return new AppError({
        code,
        statusCode: 404,
        message,
        details,
    });
}

export function conflict(code: AppErrorCode, message: string, details?: unknown) {
    return new AppError({
        code,
        statusCode: 409,
        message,
        details,
    });
}

export function unauthorized(code: AppErrorCode, message: string, details?: unknown) {
    return new AppError({
        code,
        statusCode: 401,
        message,
        details,
    });
}

export function forbidden(code: AppErrorCode, message: string, details?: unknown) {
    return new AppError({
        code,
        statusCode: 403,
        message,
        details,
    });
}

export function badRequest(code: AppErrorCode, message: string, details?: unknown) {
    return new AppError({
        code,
        statusCode: 400,
        message,
        details,
    });
}

export function unprocessableEntity(code: AppErrorCode, message: string, details?: unknown) {
    return new AppError({
        code,
        statusCode: 422,
        message,
        details,
    });
}

export function internalServerError(code: AppErrorCode, message: string, details?: unknown) {
    return new AppError({
        code,
        statusCode: 500,
        message,
        details,
    });
}