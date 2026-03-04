src/
  app.ts
  server.ts

  config/
    env.ts
    plugins.ts

  shared/
    errors/
      AppError.ts
    http/
      auth.ts
    utils/
      assert.ts

  infrastructure/
    database/
      prisma.ts
    storage/
      LocalStorageService.ts

  modules/
    auth/
      auth.routes.ts
      auth.controller.ts
      auth.service.ts
      auth.repository.ts
      auth.domain.ts
      auth.types.ts

    manga/
      manga.routes.ts
      manga.controller.ts
      manga.service.ts
      manga.repository.ts
      manga.domain.ts
      manga.types.ts

    book/
      book.routes.ts
      book.controller.ts
      book.service.ts
      book.repository.ts
      book.domain.ts
      book.types.ts

    collections/
      collections.routes.ts
      collections.controller.ts
      collections.service.ts
      collections.repository.ts
      collections.domain.ts
      collections.types.ts

    reading/
      reading.routes.ts
      reading.controller.ts
      reading.service.ts
      reading.repository.ts
      reading.domain.ts
      reading.types.ts