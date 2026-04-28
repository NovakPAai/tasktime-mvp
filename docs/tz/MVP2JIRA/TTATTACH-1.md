# ТЗ: TTATTACH-1 — Функционал вложений (Issue + Comment)

**Дата:** 2026-04-23
**Тип:** EPIC | **Приоритет:** P1 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

В текущей системе **нет функционала вложений**. Невозможно прикрепить скриншот к задаче, спецификацию к комментарию, мокап к release-note. Это критический пробел для любого серьёзного tracker'а.

Задача реализует:
- Полиморфные attachments к **Issue** и **Comment**.
- **Pluggable storage** — local FS и S3 (выбор через ENV).
- **MIME whitelist** (images/docs/text/archives) + admin-настройка.
- **Max file size** 25 MB default, в админ-настройке.
- **Thumbnails** для images (server-side через `sharp`) + lightbox preview.
- **Inherit permissions** — доступ к attachment = доступ к parent entity (через TTSEC-3).
- **Hard-delete** + 10-сек undo-banner на фронте.
- **Multipart upload** (без TUS — файлы до 25MB).
- **Virus scan — нет в MVP** (только MIME whitelist).

### Пользовательские сценарии

**Dev прикладывает скриншот:**
1. На карточке issue жмёт «Прикрепить файл» → drag-n-drop.
2. Upload показывает прогресс-бар, после завершения — thumbnail.
3. Клик по thumbnail → lightbox с zoom.

**QA прикладывает PDF-спецификацию:**
1. На комментарии кнопка «+Файл».
2. PDF загружается, в комментарии появляется иконка-файл + имя + размер + кнопка «Скачать».

**Админ настраивает storage:**
1. `/admin/attachments/settings` → max size 50 MB, добавляет MIME `video/mp4`.
2. ENV `ATTACHMENT_STORAGE=s3`, `S3_BUCKET=tt-uploads`.

**PRIVATE задача:**
1. На PRIVATE issue (TTSEC-3) attachment виден только тем, у кого есть доступ к issue.

---

## 2. Текущее состояние

- **Модель Attachment отсутствует.**
- **Multer / upload endpoint отсутствует** для задач (есть только CSV-экспорт).
- **Storage abstraction отсутствует.**
- **Thumbnail pipeline отсутствует.**
- Comments — есть, markdown-рендеринг в BEM-стиле (react-markdown).

---

## 3. Зависимости

### Модули backend (новые)
- [ ] `modules/attachments/attachments.service.ts` — upload, download, delete, list.
- [ ] `modules/attachments/attachments.router.ts` — endpoints.
- [ ] `shared/storage/` — абстракция `StorageProvider`, реализации `LocalStorage` и `S3Storage`.
- [ ] `shared/thumbnails/` — sharp-wrapper для image resize.

### Модули backend (изменённые)
- [ ] `modules/issues/issues.service.ts` — добавить relation `attachments`.
- [ ] `modules/comments/comments.service.ts` — аналогично.
- [ ] `shared/middleware/visibility.ts` (TTSEC-3) — extend для attachments.

### Frontend
- [ ] `components/attachments/AttachmentUploader.tsx` — drag-n-drop + progress.
- [ ] `components/attachments/AttachmentList.tsx` — превью + download.
- [ ] `components/attachments/ImageLightbox.tsx` — overlay для images.
- [ ] `pages/admin/AdminAttachmentsSettingsPage.tsx` — MIME whitelist + max size.

### Модели данных (Prisma)
- [ ] `Attachment` — полиморфная.
- [ ] `SystemSetting` ключи: `attachments.max_size_bytes`, `attachments.mime_whitelist`, `attachments.enabled`.

### Внешние зависимости
- [ ] `multer` — multipart parsing.
- [ ] `sharp` — thumbnails (image resize).
- [ ] `@aws-sdk/client-s3` — S3 (опционально, lazy-loaded если storage=s3).
- [ ] `mime-types` — validation.

### Блокеры
- Нет. TTSEC-3 желателен (иначе attachments не наследуют visibility), но не строго блокер.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Upload без virus-scan → вредонос попадает в storage | Средняя | Infection | MIME whitelist + Content-Disposition:attachment при download + отсутствие inline-рендеринга неdoc/image файлов; в roadmap — ClamAV через Kafka (следующее ТЗ) |
| 2 | Пользователь скачивает PRIVATE attachment через direct URL без сессии | Высокая | Leak | Signed URLs с JWT-токеном (TTL 60 сек), генерятся при каждом запросе; S3 — presigned URL |
| 3 | Thumbnail-генерация блокирует upload (sharp slow на больших images) | Средняя | Slow uploads | Async thumbnail: запись attachment в БД сразу, генерация в BullMQ background-job |
| 4 | S3-bucket misconfigured (public read) → leak | Высокая | Leak | Bucket-policy требование «private», health-check при старте сервиса |
| 5 | Big file blocks HTTP keep-alive | Средняя | Performance | Nginx/proxy-level `client_max_body_size=30M` (25 MB + overhead); backend `express.json()` не применяется к `/attachments/upload` |
| 6 | Hard-delete — undo-окно не успевает, юзер случайно удалил важное | Средняя | Data loss | Undo-banner 10 сек + подтверждение для файлов > 10MB; audit-log восстановления (хотя файл уже unlink) |
| 7 | Local storage переполняется | Средняя | Crash | Cleanup cron для soft-deleted attachments (но у нас hard-delete); метрика дискового пространства + alert |

---

## 5. Особенности реализации

### 5.1 Модели

```prisma
enum AttachmentEntityType {
  ISSUE
  COMMENT
}

model Attachment {
  id              String                @id @default(uuid())
  entityType      AttachmentEntityType  @map("entity_type")
  entityId        String                @map("entity_id")
  filename        String                // original filename
  storageKey      String                @map("storage_key")  // path в storage
  mimeType        String                @map("mime_type")
  sizeBytes       Int                   @map("size_bytes")
  checksumSha256  String                @map("checksum_sha256")
  uploadedById    String                @map("uploaded_by_id")
  thumbnailKey    String?               @map("thumbnail_key")  // для images, null для остальных
  createdAt       DateTime              @default(now())

  uploadedBy      User                  @relation(fields: [uploadedById], references: [id])

  @@index([entityType, entityId])
  @@index([uploadedById])
  @@map("attachments")
}
```

### 5.2 Storage abstraction

```typescript
// shared/storage/storage.interface.ts
export interface StorageProvider {
  put(key: string, data: Buffer | Readable, mime: string): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

// shared/storage/local.ts
export class LocalStorage implements StorageProvider {
  constructor(private basePath: string) {}
  // использует fs/promises + crypto.createHmac для signed URLs
}

// shared/storage/s3.ts
export class S3Storage implements StorageProvider {
  constructor(private bucket: string, private client: S3Client) {}
  // использует @aws-sdk/s3-request-presigner
}

// shared/storage/index.ts
export function createStorage(): StorageProvider {
  const type = process.env.ATTACHMENT_STORAGE ?? 'local';
  if (type === 's3') {
    return new S3Storage(
      process.env.S3_BUCKET!,
      new S3Client({ region: process.env.AWS_REGION, ... }),
    );
  }
  return new LocalStorage(process.env.ATTACHMENT_LOCAL_PATH ?? '/var/attachments');
}
```

### 5.3 Upload endpoint

```typescript
// POST /api/:entityType/:entityId/attachments  (entityType: issues|comments)
// Content-Type: multipart/form-data, field "file"
router.post(
  '/:entityType/:entityId/attachments',
  requireAuth,
  multer({ limits: { fileSize: 25 * 1024 * 1024 } }).single('file'),
  async (req, res) => {
    const { entityType, entityId } = req.params;
    const file = req.file;

    // 1. Validate MIME
    const settings = await getAttachmentSettings();
    if (!settings.mimeWhitelist.includes(file.mimetype)) {
      return res.status(400).json({ error: 'MIME_NOT_ALLOWED' });
    }

    // 2. Check parent entity exists + user has access
    await assertCanAccessEntity(req.userId, entityType, entityId);

    // 3. Compute checksum
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // 4. Store
    const storageKey = `${entityType}/${entityId}/${Date.now()}-${randomSuffix()}-${sanitize(file.originalname)}`;
    await storage.put(storageKey, file.buffer, file.mimetype);

    // 5. Create DB record
    const att = await prisma.attachment.create({
      data: {
        entityType: entityType.toUpperCase(),
        entityId,
        filename: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksumSha256: checksum,
        uploadedById: req.userId,
      },
    });

    // 6. Async: generate thumbnail для images
    if (file.mimetype.startsWith('image/')) {
      await queue.add('generate-thumbnail', { attachmentId: att.id });
    }

    return res.status(201).json(att);
  }
);
```

### 5.4 Download с signed URLs

```typescript
// GET /api/attachments/:id/download
// 1. Find attachment
// 2. Check access (parent entity visibility)
// 3. Если local — stream из файла
// 4. Если S3 — redirect на presigned URL (TTL 60 сек)
// 5. Set Content-Disposition: attachment; filename=...
// 6. Audit-log скачивания (для sensitive MIME)
```

### 5.5 Thumbnail generator (BullMQ)

```typescript
// shared/thumbnails/generator.ts
export async function generateThumbnail(attachmentId: string): Promise<void> {
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) return;

  const original = await storage.get(att.storageKey);
  const resized = await sharp(await streamToBuffer(original))
    .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const thumbKey = `thumbs/${att.id}.jpg`;
  await storage.put(thumbKey, resized, 'image/jpeg');

  await prisma.attachment.update({
    where: { id: att.id },
    data: { thumbnailKey: thumbKey },
  });
}
```

### 5.6 Default MIME whitelist

```json
{
  "mimeWhitelist": [
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/zip",
    "application/x-tar",
    "application/gzip",
    "application/json"
  ],
  "maxSizeBytes": 26214400,
  "enabled": true
}
```

### 5.7 Delete + undo

- `DELETE /api/attachments/:id` — hard-delete (удаляет файл со storage + запись из БД).
- Audit-log событие `attachment_deleted` с `{ filename, sizeBytes }` — для расследований.
- Фронт после delete показывает toast «Файл удалён» + «Отменить» на 10 сек.
- Если «Отменить» нажата **в течение окна** — из локального state удаляется `attachment`, но запрос **не уходит** (на фронте debounce-реализация отложенного запроса).

```typescript
// Frontend:
const handleDelete = () => {
  setOptimisticallyDeleted(attachmentId);
  const timer = setTimeout(() => {
    api.delete(`/attachments/${attachmentId}`);  // только через 10 сек
  }, 10_000);
  showToast({ message: 'Файл удалён', action: { label: 'Отменить', onClick: () => {
    clearTimeout(timer);
    setOptimisticallyDeleted(null);
  } } });
};
```

### 5.8 Frontend — AttachmentUploader

- Drag-n-drop zone + button «Выбрать файлы».
- Многофайловый upload параллельно.
- Прогресс-бар per-file + общий.
- Ошибки (413, 400 MIME_NOT_ALLOWED) — показываем на тосте.

### 5.9 AttachmentList

Для каждого attachment:
- **Images:** thumbnail 120×120 + click → lightbox с original.
- **Non-images:** иконка (PDF/doc/generic) + filename + size + кнопки Download/Delete.
- Group by upload date (today / yesterday / earlier).

### 5.10 Admin settings UI

`/admin/attachments/settings`:
- Toggle «Enabled».
- InputNumber max size (MB).
- TagsInput для MIME whitelist.
- Info-блок: текущий storage (local/s3), disk usage (если local).

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Модель Attachment + API upload/download/delete/list.
- [ ] FR-2: Storage pluggable (local/s3) через ENV.
- [ ] FR-3: MIME whitelist + max size настраивается в админке.
- [ ] FR-4: Thumbnails для images генерятся async.
- [ ] FR-5: Permissions наследуются от parent entity (через TTSEC-3 JOIN).
- [ ] FR-6: Signed URL TTL 60 сек для local; presigned для S3.
- [ ] FR-7: Hard-delete + 10-сек undo-banner на фронте.
- [ ] FR-8: Multipart up to 25 MB.
- [ ] FR-9: Attachment прикрепляется к Issue и Comment.
- [ ] FR-10: Drag-n-drop + progress в UI.
- [ ] FR-11: Lightbox для images.

### Нефункциональные
- [ ] NFR-1: Upload 10 MB файла < 5 сек на localhost.
- [ ] NFR-2: Thumbnail generation async — не блокирует upload.
- [ ] NFR-3: Download для S3 → presigned URL, backend не стримит сам.
- [ ] NFR-4: Disk-usage для local: alert при > 80% заполнения volume.

### Безопасность
- [ ] SEC-1: MIME whitelist — single source of truth, не обходится через extension.
- [ ] SEC-2: Content-Disposition: attachment (не inline) для всех, кроме images/pdf (где разрешаем inline).
- [ ] SEC-3: Signed URLs с JWT-подписью и expiry.
- [ ] SEC-4: S3-bucket проверяется на приватность при старте.
- [ ] SEC-5: Audit-log для upload, delete, download (sensitive).
- [ ] SEC-6: Filename sanitization (убираем `..`, control chars).

### Тестирование
- [ ] Unit: storage abstraction (обе реализации).
- [ ] Unit: MIME-validation, size limits, filename-sanitization.
- [ ] Integration: upload PDF to issue → download works → visibility через TTSEC-3.
- [ ] Integration: PRIVATE issue — не-admin не скачивает attachment (403).
- [ ] E2E: drag-n-drop → thumbnail → lightbox.
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки

- [ ] AC-1: Upload PNG к issue → появляется thumbnail через ~2 сек.
- [ ] AC-2: Upload PDF к comment → иконка файла + download.
- [ ] AC-3: Upload MP4 (не в whitelist) → 400 MIME_NOT_ALLOWED.
- [ ] AC-4: Upload 30MB → 413.
- [ ] AC-5: S3-storage работает через ENV-switch (integration-тест на MinIO).
- [ ] AC-6: Delete + undo в течение 10 сек сохраняет файл.
- [ ] AC-7: Delete после 10 сек реально удаляет (storage + DB).
- [ ] AC-8: PRIVATE issue — 3й пользователь получает 403 на /attachments/:id/download.
- [ ] AC-9: Admin settings настраиваются, применяются без перезапуска.
- [ ] AC-10: Tests + security-review зелёные.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Storage abstraction (local + s3) | 12 |
| Prisma model + migration | 2 |
| Upload endpoint (multer + validation + sanitization) | 6 |
| Download endpoint + signed URLs | 5 |
| Delete + audit-logging | 3 |
| Thumbnail pipeline (sharp + BullMQ) | 6 |
| Visibility integration (TTSEC-3) | 3 |
| Admin settings UI | 4 |
| Frontend: AttachmentUploader (drag-n-drop + progress) | 8 |
| Frontend: AttachmentList + Lightbox | 8 |
| Integration с IssueDetailPage + Comment | 4 |
| Tests (unit + integration + security + MinIO) | 14 |
| Docs | 3 |
| Code review + AI review | 6 |
| **Итого** | **84** (~1.5 спринта) |

---

## 9. Связанные задачи

- **Зависит от:** нет (TTSEC-3 желателен для полноценной visibility-фильтрации).
- **Блокирует:** **TTBRAND-1** (reuse storage-абстракции для логотипа).
- **Связано:** TTNOTIF-1 (attachments в email — опциональная фаза).

---

## 10. Иерархия задач

```
TTATTACH-1 (EPIC) — Функционал вложений
  ├─ TTATTACH-1.1 — Storage abstraction (local + s3)
  ├─ TTATTACH-1.2 — Prisma model + migration
  ├─ TTATTACH-1.3 — Upload/download/delete endpoints + security
  ├─ TTATTACH-1.4 — Thumbnail BullMQ pipeline
  ├─ TTATTACH-1.5 — Visibility integration
  ├─ TTATTACH-1.6 — Admin settings UI
  ├─ TTATTACH-1.7 — Frontend uploader + list + lightbox
  └─ TTATTACH-1.8 — Tests + docs
```
