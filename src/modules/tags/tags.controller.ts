import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TagsService } from "./tags.service.js";

const scopeSchema = z.enum(["MANGA", "BOOK"]);

const listTagsQuerySchema = z.object({
  scope: scopeSchema,
});

const createTagSchema = z.object({
  scope: scopeSchema,
  name: z.string().trim().min(1).max(50),
});

export class TagsController {
  constructor(private service: TagsService) {}

  listTags = async (req: FastifyRequest, reply: FastifyReply) => {
    const { scope } = listTagsQuerySchema.parse(req.query);
    const tags = await this.service.listTags(scope);
    return reply.send(tags);
  };

  createTag = async (req: FastifyRequest, reply: FastifyReply) => {
    const { scope, name } = createTagSchema.parse(req.body);
    const tag = await this.service.createTag(scope, name);
    return reply.send(tag);
  };
}
