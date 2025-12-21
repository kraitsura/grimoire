/**
 * Plugin Services
 */

export { ClaudeCliService, ClaudeCliServiceLive } from "./claude-cli-service";
export {
  MarketplaceDetectionService,
  MarketplaceDetectionServiceLive,
  parseGitHubSource,
  type GitHubSource,
  type MarketplaceType,
} from "./marketplace-detection-service";
export { MarketplaceService, MarketplaceServiceLive } from "./marketplace-service";
