export interface JobResultDto {
  usersProcessed: number;
  noticesCreated: number;
  pushSent: number;
  emailsSent: number;
  failures: number;
  hasMore: boolean;
  durationMs: number;
}

export interface UnsubscribeResultDto {
  unsubscribed: boolean;
}
