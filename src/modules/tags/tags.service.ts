import type { TagScope } from "@prisma/client";
import { conflict } from "../../shared/errors/error-factory.js";
import { normalizeTagName, slugifyTag } from "../../shared/utils/tags.js";
import { TagsRepository } from "./tags.repository.js";

export class TagsService {
  constructor(private repo: TagsRepository) {}

  async listTags(scope: TagScope) {
    const tags = await this.repo.findByScope(scope);
    return tags.map((tag) => ({
      id: tag.id,
      scope: tag.scope,
      name: tag.name,
      slug: tag.slug,
    }));
  }

  async createTag(scope: TagScope, name: string) {
    const normalizedName = normalizeTagName(name);
    const slug = slugifyTag(normalizedName);
    const existing = await this.repo.findByScopeAndSlug(scope, slug);
    if (existing) {
      throw conflict("TAG_ALREADY_EXISTS", "Tag already exists for this scope");
    }

    const created = await this.repo.createTag({
      scope,
      name: normalizedName,
      slug,
    });

    return {
      id: created.id,
      scope: created.scope,
      name: created.name,
      slug: created.slug,
    };
  }
}
