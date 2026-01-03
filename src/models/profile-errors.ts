/**
 * Profile Domain Error Types
 */

import { Data } from "effect";

/**
 * Error when a profile is not found
 */
export class ProfileNotFoundError extends Data.TaggedError("ProfileNotFoundError")<{
  harnessId: string;
  profileName: string;
}> {}

/**
 * Error when a profile already exists
 */
export class ProfileAlreadyExistsError extends Data.TaggedError("ProfileAlreadyExistsError")<{
  harnessId: string;
  profileName: string;
}> {}

/**
 * Error when profile name is invalid
 */
export class InvalidProfileNameError extends Data.TaggedError("InvalidProfileNameError")<{
  name: string;
  reason: string;
}> {}

/**
 * Error when harness is not installed
 */
export class HarnessNotInstalledError extends Data.TaggedError("HarnessNotInstalledError")<{
  harnessId: string;
  configPath: string;
}> {}

/**
 * Error when harness is not recognized
 */
export class UnknownHarnessError extends Data.TaggedError("UnknownHarnessError")<{
  harnessId: string;
  validHarnesses: string[];
}> {}

/**
 * Error when profile switch fails
 */
export class ProfileSwitchError extends Data.TaggedError("ProfileSwitchError")<{
  harnessId: string;
  profileName: string;
  reason: string;
}> {}

/**
 * Error when profile backup fails
 */
export class ProfileBackupError extends Data.TaggedError("ProfileBackupError")<{
  harnessId: string;
  reason: string;
}> {}

/**
 * Error when profile extraction fails
 */
export class ProfileExtractionError extends Data.TaggedError("ProfileExtractionError")<{
  harnessId: string;
  profileName: string;
  reason: string;
}> {}

/**
 * Error when deleting the active profile
 */
export class CannotDeleteActiveProfileError extends Data.TaggedError("CannotDeleteActiveProfileError")<{
  harnessId: string;
  profileName: string;
}> {}

/**
 * Error when profile config file is invalid
 */
export class ProfileConfigError extends Data.TaggedError("ProfileConfigError")<{
  path: string;
  reason: string;
}> {}
