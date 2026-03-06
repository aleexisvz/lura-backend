export type CreateMangaDTO = {
  title: string
  author?: string
}

export type CreateVolumeDTO = {
  mangaId: string
  number: number
  title?: string
}

export type UploadPagesParams = {
  mangaId: string
  volumeId: string
  userId: string
}