import { InvalidToolInputError } from "ai";
import { RuthToolError } from "../tools/core.ts";

/** Only domain messages cross the chat boundary; SDK errors may contain credentials or input. */
export const ruthStreamError = (error: unknown): string => {
  if (error instanceof RuthToolError && error.message.trim()) return error.message;
  if (InvalidToolInputError.isInstance(error))
    return "The tool arguments were invalid. Ava can correct them and try again.";
  return "Ava ran into a problem. Please try again.";
};
