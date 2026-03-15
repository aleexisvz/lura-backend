export type AppErrorCode =
	| "INVALID_PARAMS"
	| "EMAIL_ALREADY_IN_USE"
	| "INVALID_CREDENTIALS"
	| "ADMIN_ONLY"
	| "MANGA_NOT_FOUND"
	| "VOLUME_NUMBER_DUPLICATE"
	| "NO_FILES_UPLOADED"
	| "VOLUME_NOT_FOUND"
	| "PAGE_NOT_FOUND"
	| "PAGE_FILE_NOT_FOUND";

export class AppError extends Error {
	readonly code: AppErrorCode;
	readonly statusCode: number;
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
