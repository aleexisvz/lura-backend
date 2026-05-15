import type { TagScope } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import type { CreateTagDTO } from "./tags.types.js";

export class TagsRepository {
  findByScope(scope: TagScope) {
    return prisma.tag.findMany({
      where: { scope },
      orderBy: { name: "asc" },
    });
  }

  findByScopeAndSlug(scope: TagScope, slug: string) {
    return prisma.tag.findFirst({
      where: { scope, slug },
    });
  }

  createTag(data: CreateTagDTO & { slug: string }) {
    return prisma.tag.create({
      data,
    });
  }

  findByIds(ids: string[]) {
    return prisma.tag.findMany({
      where: { id: { in: ids } },
    });
  }
}
