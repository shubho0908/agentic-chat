import { API_ERROR_MESSAGES, HTTP_STATUS } from '@/constants/errors';

interface ParsedError {
  message: string;
  statusCode: number;
}

export function parseOpenAIError(error: unknown): ParsedError {
  if (!(error instanceof Error)) {
    return {
      message: API_ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    };
  }

  const errorMsg = error.message.toLowerCase();

  if (errorMsg.includes('rate limit') || errorMsg.includes('rate_limit')) {
    return {
      message: API_ERROR_MESSAGES.OPENAI_RATE_LIMIT,
      statusCode: 429,
    };
  }

  if (errorMsg.includes('insufficient_quota') || errorMsg.includes('quota')) {
    return {
      message: API_ERROR_MESSAGES.OPENAI_INSUFFICIENT_QUOTA,
      statusCode: 429,
    };
  }

  if (errorMsg.includes('invalid api key') || errorMsg.includes('invalid_api_key') || errorMsg.includes('incorrect api key')) {
    return {
      message: API_ERROR_MESSAGES.OPENAI_INVALID_API_KEY,
      statusCode: HTTP_STATUS.UNAUTHORIZED,
    };
  }

  if (errorMsg.includes('model') && (errorMsg.includes('not found') || errorMsg.includes('does not exist'))) {
    return {
      message: API_ERROR_MESSAGES.OPENAI_MODEL_NOT_FOUND,
      statusCode: HTTP_STATUS.NOT_FOUND,
    };
  }

  if (errorMsg.includes('context_length_exceeded') || errorMsg.includes('context length')) {
    return {
      message: API_ERROR_MESSAGES.OPENAI_CONTEXT_LENGTH_EXCEEDED,
      statusCode: HTTP_STATUS.BAD_REQUEST,
    };
  }

  return {
    message: error.message,
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  };
}
