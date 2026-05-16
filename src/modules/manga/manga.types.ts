export type CreateMangaDTO = {
  title: string
  titleKanji?: string
  author?: string
  description?: string
  tagIds?: string[]
}

export type UpdateMangaDTO = {
  title?: string
  titleKanji?: string
  author?: string
  description?: string
  tagIds?: string[]
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
