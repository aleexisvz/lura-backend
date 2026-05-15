/**
 * All domain / application errors thrown inside services and repositories.
 * The global Fastify error handler in app.ts catches these and serializes
 * them into a consistent JSON response:
 *
 *   { "code": "MANGA_NOT_FOUND", "message": "Manga not found" }
 *
 * Using a typed union for codes means TypeScript will catch any typo at
 * compile time; add new codes here when introducing new error cases.
 */
export type AppErrorCode =
	| "INVALID_PARAMS"
	| "VALIDATION_ERROR"
	| "EMAIL_ALREADY_IN_USE"
	| "INVALID_CREDENTIALS"
	| "UNAUTHORIZED"
	| "INVALID_TOKEN"
	| "ADMIN_ONLY"
	| "MANGA_NOT_FOUND"
	| "BOOK_NOT_FOUND"
	| "MANGA_COVER_NOT_FOUND"
	| "BOOK_COVER_NOT_FOUND"
	| "VOLUME_COVER_NOT_FOUND"
	| "VOLUME_NUMBER_DUPLICATE"
	| "NO_FILES_UPLOADED"
	| "VOLUME_NOT_FOUND"
	| "VOLUME_NOT_READY"
	| "PAGE_NOT_FOUND"
	| "PAGE_FILE_NOT_FOUND"
	| "COVER_FILE_NOT_FOUND"
	| "PAGE_OUT_OF_RANGE"
	| "READING_SESSION_NOT_FOUND"
	| "READING_SESSION_FORBIDDEN"
	| "USER_NOT_FOUND"
	| "INTERNAL_SERVER_ERROR";

export class AppError extends Error {
	readonly code: AppErrorCode;
	readonly statusCode: number;
	// Optional extra context (e.g. validation field errors) forwarded to the client.
	readonly details?: unknown;

	constructor(options: {
		code: AppErrorCode;
		statusCode: number;
		message: string;
		details?: unknown;
	}) {
		super(options.message);
		this.name = "AppError";
		this.code = options.code;
		this.statusCode = options.statusCode;
		this.details = options.details;
	}
}
