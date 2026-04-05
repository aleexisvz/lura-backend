# Decisions Log

## Architecture

- Modular by feature chosen over layered global structure

## Storage

- Local filesystem first
- Cloud storage postponed

## Upload Strategy

- Multipart upload (simple)
- Chunked upload postponed

## Content Model

- Global content (admin-managed)
- No user uploads (for now)

## Auth

- JWT-based authentication

## Error Handling

- Centralized error handler
- Typed error codes (AppError)

## Prefetch

- Handled in frontend
- Backend prepared via API design