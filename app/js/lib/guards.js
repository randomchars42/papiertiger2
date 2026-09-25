export const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
