function getApiUrl(): string {
  const url = process.env.API_URL;

  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error(
      '[apps/web] API_URL is required in production. ' +
        'Set API_URL=https://your-api-url in your environment.',
    );
  }

  // Development fallback — configure API_URL in .env to point to the running API.
  return url ?? 'http://localhost:4000';
}

export const API_URL = getApiUrl();
