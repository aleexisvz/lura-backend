export type CreateMangaDTO = {
  title: string
  titleKanji?: string
  author?: string
  description?: string
  tagIds?: string[]
  status?: "EN_EMISION" | "FINALIZADO"
}

export type UpdateMangaDTO = {
  title?: string
  titleKanji?: string
  author?: string
  description?: string
  tagIds?: string[]
  status?: "EN_EMISION" | "FINALIZADO"
}

export type CreateVolumeDTO = {
  mangaId: string
  number: number
  title?: string
}

export type UpdateVolumeDTO = {
  number?: number
  title?: string
}

export type UploadPagesParams = {
  mangaId: string
  volumeId: string
  userId: string
}
