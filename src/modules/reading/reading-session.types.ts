export type StartReadingSessionDTO = {
    contentType: "MANGA" | "BOOK"
    contentId: string
}

export type EndReadingSessionDTO = {
    sessionId: string
}