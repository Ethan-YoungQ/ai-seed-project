/**
 * Shared type contracts for the Sub2 Feishu Card Protocol.
 * Defines all card types, action handling, state shapes, and dependencies.
 */

// ============================================================================
// Card Type Definitions
// ============================================================================

/** Union of all 17 card types in the Sub2 protocol */
export type CardType =
  | "period_open"
  | "window_open"
  | "quiz"
  | "homework_submit"
  | "video_checkin"
  | "peer_review_vote"
  | "peer_review_settle"
  | "daily_checkin"
  | "leaderboard"
  | "level_announcement"
  | "graduation"
  | "llm_decision"
  | "c1_echo"
  | "review_queue"
  | "member_mgmt"
  | "manual_adjust"
  | "admin_panel"
  | "dashboard_pin";

/** Version directive for card handling strategy */
export type CardVersionDirective = "current" | "legacy" | "expired";

// ============================================================================
// Feishu Card Structures
// ============================================================================

/** Feishu Open Card JSON format (schema 2.0) */
export interface FeishuCardJson {
  schema: "2.0";
  config?: Record<string, unknown>;
  header: Record<string, unknown>;
  body: {
    elements: Array<Record<string, unknown>>;
  };
}

/**
 * Context passed to every card action handler.
 * Contains metadata about the user action and card interaction.
 */
export interface CardActionContext {
  operatorOpenId: string;
  triggerId: string;
  actionName: string;
  actionPayload: Record<string, unknown>;
  messageId: string;
  chatId: string;
  receivedAt: string;
  currentVersion: string;
}

/**
 * Result returned by a card action handler.
 * May include a new card state, a toast notification, or follow-up work.
 */
export interface CardActionResult {
  newCardJson?: FeishuCardJson;
  toast?: {
    type: "info" | "error" | "success" | "warning";
    content: string;
  };
  followUp?: () => Promise<void>;
}

/** Signature of all card action handlers */
export type CardHandler = (
  ctx: CardActionContext,
  deps: CardHandlerDeps
) => Promise<CardActionResult>;

// ============================================================================
// Dependencies Injected into Handlers
// ============================================================================

/** Repository interface for card handlers */
export interface CardHandlerDeps {
  repo: {
    findMemberByOpenId(openId: string): MemberLite | null;
    insertPeerReviewVote(vote: Partial<PeerReviewVote>): Promise<PeerReviewVote>;
    insertReactionTrackedMessage(
      msg: Partial<ReactionTrackedMessageRow>
    ): Promise<ReactionTrackedMessageRow>;
    listPriorQuizSelections(
      memberId: string,
      questionId: string
    ): Promise<QuizSelection[]>;
    insertCardInteraction(
      interaction: Partial<CardInteractionRow>
    ): Promise<CardInteractionRow>;
    findLiveCard(cardType: CardType, chatId: string): LiveCardRow | null;
    updateLiveCardState(
      id: string,
      stateJson: unknown,
      patchedAt: string
    ): void;
    insertLiveCard(card: Partial<LiveCardRow>): Promise<LiveCardRow>;
    closeLiveCard(
      id: string,
      reason: "expired" | "period_closed" | "replaced_by_new"
    ): Promise<LiveCardRow>;
    findEventById(eventId: string): Promise<ScoringEventLite | null>;
    listReviewRequiredEvents(opts?: {
      limit?: number;
      offset?: number;
    }): Promise<ReviewQueueEventRow[]>;
    countReviewRequiredEvents(): Promise<number>;
  };
  ingestor: {
    ingest(req: IngestRequest): Promise<IngestResult>;
  };
  aggregator: {
    applyDecision(
      eventId: string,
      decision: "approved" | "rejected"
    ): Promise<ApplyDecisionResult>;
  };
  feishuClient: {
    patchCard(messageId: string, cardJson: FeishuCardJson): Promise<void>;
    sendCard(
      chatId: string,
      cardJson: FeishuCardJson
    ): Promise<{ messageId: string }>;
  };
  adminApiClient: AdminApiClient;
  config: Sub2Config;
  requestReappeal(eventId: string): Promise<void>;
  clock: () => Date;
  uuid: () => string;
}

// ============================================================================
// Domain Models
// ============================================================================

/** Lightweight member representation for card rendering and auth checks */
export interface MemberLite {
  id: string;
  displayName: string;
  roleType: "student" | "operator" | "trainer" | "observer";
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
  currentLevel: number;
}

/** Quiz selection by a member */
export interface QuizSelection {
  questionId: string;
  optionId: string;
  selectedAt: string;
}

/** Peer review voting record */
export interface PeerReviewVote {
  id: string;
  peerReviewSessionId: string;
  voterMemberId: string;
  votedMemberId: string;
  votedAt: string;
}

/** Reaction-tracked Feishu message record */
export interface ReactionTrackedMessageRow {
  id: string;
  feishuMessageId: string;
  memberId: string;
  itemCode: "C2";
  postedAt: string;
  reactionCount: number;
}

/** Admin API client for member management */
export interface AdminApiClient {
  patchMember(
    memberId: string,
    body: {
      roleType?: string;
      hiddenFromBoard?: boolean;
      displayNameOverride?: string;
    }
  ): Promise<MemberLite>;
  listMembers(): Promise<MemberLite[]>;
}

/** Configuration for Sub2 card system */
export interface Sub2Config {
  groupChatId: string;
  campId: string;
  cardVersionCurrent: string;
  cardVersionLegacy: string;
  radarImageBaseUrl: string;
}

// ============================================================================
// Card Interaction History
// ============================================================================

/** Card interaction event logged for analytics and replay */
export interface CardInteractionRow {
  id: string;
  memberId: string | null;
  periodId: string | null;
  cardType: CardType;
  actionName: string;
  feishuMessageId: string | null;
  feishuCardVersion: string;
  payloadJson: unknown;
  receivedAt: string;
  triggerId: string;
  operatorOpenId: string;
  rejectedReason: string | null;
}

// ============================================================================
// Ingestion & Aggregation
// ============================================================================

/** Ingest request for scoring events */
export interface IngestRequest {
  memberId: string;
  itemCode: string;
  sourceType: string;
  sourceRef: string;
  payload: Record<string, unknown>;
  requestedDelta?: number;
  requestedAt: string;
}

/** Result of an ingest operation */
export interface IngestResult {
  eventId: string;
  effectiveDelta: number;
  status: "pending" | "approved" | "rejected" | "review_required";
  reason?: string;
}

/** Result of applying a reviewer decision */
export interface ApplyDecisionResult {
  eventId: string;
  previousStatus: "review_required";
  newStatus: "approved" | "rejected";
  memberId: string;
  itemCode: string;
  scoreDelta: number;
}

/** Lightweight scoring event for card handlers */
export interface ScoringEventLite {
  id: string;
  memberId: string;
  itemCode: string;
  status: string;
  scoreDelta: number;
  payloadJson: unknown;
  createdAt: string;
}

/** Event in the review queue */
export interface ReviewQueueEventRow {
  eventId: string;
  memberId: string;
  memberName: string;
  itemCode: string;
  scoreDelta: number;
  textExcerpt: string;
  llmReason: string;
  createdAt: string;
}

// ============================================================================
// Live Card State
// ============================================================================

/** Persisted row for an active card in the chat */
export interface LiveCardRow {
  id: string;
  cardType: CardType;
  feishuMessageId: string;
  feishuChatId: string;
  campId: string;
  periodId: string | null;
  windowId: string | null;
  cardVersion: string;
  stateJson: unknown;
  sentAt: string;
  lastPatchedAt: string | null;
  expiresAt: string;
  closedReason: "expired" | "period_closed" | "replaced_by_new" | null;
}

// ============================================================================
// Card State Shapes
// ============================================================================

/** State for the daily checkin card */
export interface DailyCheckinState {
  items: {
    K3: { pending: string[]; approved: string[] };
    K4: { pending: string[]; approved: string[] };
    H2: { pending: string[]; approved: string[] };
    C1: { pending: string[]; approved: string[] };
    C3: { pending: string[]; approved: string[] };
    G2: { pending: string[]; approved: string[] };
  };
  postedAt: string;
  periodId: string;
  periodNumber: number;
}

/**
 * Factory function to create an empty daily checkin state.
 * All 6 items initialized with empty pending and approved arrays.
 */
export function emptyDailyCheckinState(input: {
  postedAt: string;
  periodId: string;
  periodNumber: number;
}): DailyCheckinState {
  return {
    items: {
      K3: { pending: [], approved: [] },
      K4: { pending: [], approved: [] },
      H2: { pending: [], approved: [] },
      C1: { pending: [], approved: [] },
      C3: { pending: [], approved: [] },
      G2: { pending: [], approved: [] },
    },
    postedAt: input.postedAt,
    periodId: input.periodId,
    periodNumber: input.periodNumber,
  };
}

/** State for the homework submission card */
export interface HomeworkSubmitState {
  sessionId: string;
  title: string;
  deadline: string;
  submitters: Array<{
    memberId: string;
    submittedAt: string;
    firstSubmitter: boolean;
  }>;
}

/** State for the leaderboard card */
export interface LeaderboardState {
  settledWindowId: string;
  generatedAt: string;
  topN: Array<{
    memberId: string;
    displayName: string;
    cumulativeAq: number;
    latestWindowAq: number;
    currentLevel: number;
    dims: {
      K: number;
      H: number;
      C: number;
      S: number;
      G: number;
    };
  }>;
  radarImageUrl: string | null;
}

/** State for the review queue card */
export interface ReviewQueueState {
  currentPage: number;
  totalPages: number;
  totalEvents: number;
  events: ReviewQueueEventRow[];
}
