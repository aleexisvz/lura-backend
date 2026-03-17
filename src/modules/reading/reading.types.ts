export type UpdateMangaProgressDTO = {
    mangaId: string
    volumeId: string
    page: number
}

export type MangaProgressResponse = {
    mangaId: string
    volumeId: string
    page: number
    updatedAt: Date
}