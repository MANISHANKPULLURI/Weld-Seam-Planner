const mb = Number(process.env.MAX_FILE_MB);
export const MAX_FILE_MB = Number.isFinite(mb) && mb > 0 ? mb : 500;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const CHUNK_BYTES = 5 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = [".stl"] as const;
export const MAX_COMPONENTS = 20;
