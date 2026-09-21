const OPENAI_API_KEY_REGEX = /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/;

export const isValidApiKey = (key: string): boolean => {
  return OPENAI_API_KEY_REGEX.test(key.trim());
};
