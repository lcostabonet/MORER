// Phase 11G-beta: POST /cart accepts NO fields. The API is the sole authority for
// a cart's session id (see CartService.create), so a caller can never supply one.
// The route's ValidationPipe (whitelist + forbidNonWhitelisted) rejects ANY
// property — including a caller-chosen sessionId, even a syntactically valid UUID.
export class CreateCartDto {}
