/**
 * EventBridge Scheduler `Scheduler` adapter (DESIGN AD-1). Arms a ONE-SHOT
 * schedule at `pickDeadline` that invokes the auto-pick Lambda with
 * `{ draftId, expectedVersion }`. `ActionAfterCompletion: DELETE` self-cleans;
 * a manual pick supersedes the fire via the version guard. Not a ticking server.
 */
import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
  ResourceNotFoundException,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import type { Scheduler } from '../ports.js';

export interface SchedulerConfig {
  /** Target auto-pick Lambda ARN. */
  targetArn: string;
  /** IAM role the scheduler assumes to invoke the target. */
  roleArn: string;
  /** Optional schedule group; defaults to the account default group. */
  groupName?: string;
}

const scheduleName = (draftId: string): string => `opendraft-autopick-${draftId}`;

/** EventBridge Scheduler `at(...)` expects a UTC `yyyy-mm-ddThh:mm:ss` string. */
function atExpression(fireAtMs: number): string {
  return `at(${new Date(fireAtMs).toISOString().slice(0, 19)})`;
}

export class EventBridgeScheduler implements Scheduler {
  constructor(
    private readonly config: SchedulerConfig,
    private readonly client: SchedulerClient = new SchedulerClient({}),
  ) {}

  async arm(input: { draftId: string; version: number; fireAt: number }): Promise<void> {
    const common = {
      Name: scheduleName(input.draftId),
      GroupName: this.config.groupName,
      ScheduleExpression: atExpression(input.fireAt),
      FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
      ActionAfterCompletion: 'DELETE' as const,
      Target: {
        Arn: this.config.targetArn,
        RoleArn: this.config.roleArn,
        Input: JSON.stringify({ draftId: input.draftId, expectedVersion: input.version }),
      },
    };
    try {
      await this.client.send(new CreateScheduleCommand(common));
    } catch (e) {
      if (e instanceof ConflictException) {
        await this.client.send(new UpdateScheduleCommand(common));
        return;
      }
      throw e;
    }
  }

  async cancel(draftId: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteScheduleCommand({
          Name: scheduleName(draftId),
          GroupName: this.config.groupName,
        }),
      );
    } catch (e) {
      if (e instanceof ResourceNotFoundException) return; // already gone / self-deleted
      throw e;
    }
  }
}
