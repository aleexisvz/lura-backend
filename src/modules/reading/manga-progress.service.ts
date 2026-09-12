import { MangaProgressRepository } from "./manga-progress.repository.js";
import { VolumeCompletionRepository } from "./volume-completion.repository.js";
import { notFound, unprocessableEntity } from "../../shared/errors/error-factory.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { bookProgressStore } from "../book/book-progress.store.js";
import { prisma } from "../../infrastructure/database/prisma.js";

function formatSectionTitle(href?: string): string {
    if (!href) return "";
    const clean = href.split("#")[0] ?? href;
    const segments = clean.split("/");
    const file = segments[segments.length - 1] ?? clean;
    const raw = file.replace(/\.(x?html|xml)$/i, "").replace(/[-_]/g, " ");
    if (/^c(\d+)$/i.test(raw)) {
        return `Capítulo ${raw.replace(/^c/i, "")}`;
    }
    return raw;
}

export class MangaProgressService {

    constructor(
        private repo: MangaProgressRepository,
        private completionRepo = new VolumeCompletionRepository(),
        private storage = new CloudStorageService()
    ) { }

    async getProgress(userId: string, mangaId: string) {
        const progress = await this.repo.findLatestByUserAndManga(userId, mangaId);

        if (!progress) {
            return null;
        }

        const [volumeCompletion, isMangaCompleted] = await Promise.all([
            this.completionRepo.findByUserAndVolume(userId, progress.volumeId),
            this.completionRepo.isMangaCompleted(userId, mangaId),
        ]);

        return {
            mangaId: progress.mangaId,
            volumeId: progress.volumeId,
            page: progress.page,
            updatedAt: progress.updatedAt,
            volumeCompleted: Boolean(volumeCompletion?.isActive),
            completed: isMangaCompleted,
        };
    }

    async updateProgress(
        userId: string,
        mangaId: string,
        volumeId: string,
        page: number
    ) {
        const manga = await this.repo.findMangaById(mangaId);
        if (!manga) {
            throw notFound("MANGA_NOT_FOUND", "Manga not found");
        }

        const volume = await this.repo.findVolumeById(volumeId);
        if (!volume || volume.mangaId !== mangaId) {
            throw notFound("VOLUME_NOT_FOUND", "Volume not found");
        }

        if (page < 1) {
            throw unprocessableEntity("PAGE_OUT_OF_RANGE", "Page must be at least 1");
        }

        if (page > volume.pagesCount) {
            throw unprocessableEntity("PAGE_OUT_OF_RANGE", `Page ${page} exceeds volume page count (${volume.pagesCount})`);
        }

        // Upsert pattern: one progress record per (user, manga, volume) triplet.
        const current = await this.repo.findByUserAndMangaAndVolume(userId, mangaId, volumeId);

        if (!current) {
            return this.repo.create({
                userId,
                mangaId,
                volumeId,
                page,
            });
        }

        if (page < volume.pagesCount) {
            // If the user starts reading a previously completed volume again,
            // treat it as "in progress" for continue-reading surfaces.
            await this.completionRepo.deactivateByUserAndVolume(userId, volumeId);
        }

        // Progress never goes backwards inside the same volume.
        if (page <= current.page) {
            return current;
        }

        return this.repo.update(current.id, {
            page,
        });
    }

    async getContinueReading(userId: string) {
        const completedVolumeIds = await this.completionRepo.findVolumeIdsByUser(userId);
        const completedVolumeIdsSet = new Set(completedVolumeIds);
        const progressRows = await this.repo.getContinueReading(userId, 60);

        const mangaIds = [...new Set(progressRows.map((item) => item.mangaId))];
        const volumeIds = [...new Set(progressRows.map((item) => item.volumeId))];
        const [mangas, volumes] = await Promise.all([
            mangaIds.length > 0 ? this.repo.findMangasByIds(mangaIds) : [],
            volumeIds.length > 0 ? this.repo.findVolumesByIds(volumeIds) : [],
        ]);

        const mangaMap = new Map(
            mangas.map((manga) => [
                manga.id,
                {
                    title: manga.title,
                    coverUrl: manga.coverPath ? this.storage.getPublicUrl(manga.coverPath) : null,
                },
            ])
        );

        const volumeMap = new Map(
            volumes.map((volume) => [
                volume.id,
                {
                    mangaId: volume.mangaId,
                    number: volume.number,
                    title: volume.title,
                    pagesCount: volume.pagesCount,
                    status: volume.status,
                    coverUrl: volume.coverPath
                        ? this.storage.getPublicUrl(volume.coverPath)
                        : null,
                },
            ])
        );

        const mangaItems = progressRows
            .filter((entry) => {
                const volume = volumeMap.get(entry.volumeId);
                if (!volume || volume.mangaId !== entry.mangaId) {
                    return false;
                }

                if (volume.status !== "READY") {
                    return false;
                }

                const isCompleted = completedVolumeIdsSet.has(entry.volumeId);
                if (isCompleted && volume.pagesCount > 0 && entry.page >= volume.pagesCount) {
                    // Hide only volumes that are actually at the end and completed.
                    return false;
                }

                // Show all active reading entries from the first saved page.
                return entry.page >= 1;
            })
            .map((entry) => {
                const manga = mangaMap.get(entry.mangaId);
                const volume = volumeMap.get(entry.volumeId);
                const totalPages = volume?.pagesCount ?? 0;
                const progressPercent =
                    totalPages > 0
                        ? Math.max(0, Math.min(100, Math.round((entry.page / totalPages) * 100)))
                        : 0;

                return {
                    contentType: "MANGA" as const,
                    mangaId: entry.mangaId,
                    volumeId: entry.volumeId,
                    pageNumber: entry.page,
                    mangaTitle: manga?.title ?? "",
                    volumeTitle: volume?.title ?? "",
                    volumeNumber: volume?.number ?? 0,
                    totalPages,
                    progressPercent,
                    coverUrl: volume?.coverUrl ?? manga?.coverUrl ?? null,
                    updatedAt: entry.updatedAt,
                };
            });

        // Fetch book reading progress for user
        const bookEntries = bookProgressStore.getAllForUser(userId);
        let bookItems: Array<{
            contentType: "BOOK";
            bookId: string;
            title: string;
            chapterLabel: string;
            mangaId: string;
            volumeId: string;
            pageNumber: number;
            totalPages: number;
            progressPercent: number;
            coverUrl: string | null;
            updatedAt: Date;
        }> = [];

        if (bookEntries.length > 0) {
            const bookIds = bookEntries.map((b) => b.bookId);
            const books = await prisma.book.findMany({
                where: { id: { in: bookIds } },
            });
            const bookMap = new Map(books.map((b) => [b.id, b]));

            bookItems = bookEntries
                .filter((entry) => {
                    const isCompleted =
                        entry.completed === true ||
                        (entry.progressPercent ?? 0) >= 100 ||
                        (typeof entry.currentPage === "number" &&
                            typeof entry.totalPages === "number" &&
                            entry.totalPages > 1 &&
                            entry.currentPage >= entry.totalPages);
                    return !isCompleted;
                })
                .map((entry) => {
                    const book = bookMap.get(entry.bookId);
                    if (!book) return null;
                    const cleanSection = entry.chapterTitle || formatSectionTitle(entry.sectionHref);

                    return {
                        contentType: "BOOK" as const,
                        bookId: entry.bookId,
                        title: book.title || entry.title || "Libro",
                        chapterLabel: cleanSection || "Lectura en progreso",
                        mangaId: "",
                        volumeId: "",
                        pageNumber: entry.currentPage ?? 1,
                        totalPages: entry.totalPages ?? 0,
                        progressPercent: entry.progressPercent,
                        coverUrl: book.coverPath
                            ? this.storage.getPublicUrl(book.coverPath)
                            : entry.coverUrl ?? null,
                        updatedAt: new Date(entry.updatedAt),
                    };
                })
                .filter((item): item is NonNullable<typeof item> => item !== null);
        }

        const combined = [...mangaItems, ...bookItems].sort((a, b) => {
            const timeA = new Date(a.updatedAt).getTime();
            const timeB = new Date(b.updatedAt).getTime();
            return timeB - timeA;
        });

        return combined.slice(0, 20);
    }
}
