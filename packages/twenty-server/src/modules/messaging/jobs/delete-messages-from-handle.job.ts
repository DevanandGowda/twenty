import { Injectable, Logger } from '@nestjs/common';

import { MessageQueueJob } from 'src/engine/integrations/message-queue/interfaces/message-queue-job.interface';

import { InjectObjectMetadataRepository } from 'src/engine/object-metadata-repository/object-metadata-repository.decorator';
import { BlocklistRepository } from 'src/modules/connected-account/repositories/blocklist.repository';
import { BlocklistObjectMetadata } from 'src/modules/connected-account/standard-objects/blocklist.object-metadata';
import { MessageChannelMessageAssociationRepository } from 'src/modules/messaging/repositories/message-channel-message-association.repository';
import { MessageChannelRepository } from 'src/modules/messaging/repositories/message-channel.repository';
import { ThreadCleanerService } from 'src/modules/messaging/services/thread-cleaner/thread-cleaner.service';
import { MessageChannelMessageAssociationObjectMetadata } from 'src/modules/messaging/standard-objects/message-channel-message-association.object-metadata';
import { MessageChannelObjectMetadata } from 'src/modules/messaging/standard-objects/message-channel.object-metadata';

export type DeleteMessagesFromHandleJobData = {
  workspaceId: string;
  blocklistItemId: string;
};

@Injectable()
export class DeleteMessagesFromHandleJob
  implements MessageQueueJob<DeleteMessagesFromHandleJobData>
{
  private readonly logger = new Logger(DeleteMessagesFromHandleJob.name);

  constructor(
    @InjectObjectMetadataRepository(MessageChannelObjectMetadata)
    private readonly messageChannelRepository: MessageChannelRepository,
    @InjectObjectMetadataRepository(
      MessageChannelMessageAssociationObjectMetadata,
    )
    private readonly messageChannelMessageAssociationRepository: MessageChannelMessageAssociationRepository,
    @InjectObjectMetadataRepository(BlocklistObjectMetadata)
    private readonly blocklistRepository: BlocklistRepository,
    private readonly threadCleanerService: ThreadCleanerService,
  ) {}

  async handle(data: DeleteMessagesFromHandleJobData): Promise<void> {
    const { workspaceId, blocklistItemId } = data;

    const blocklistItem = await this.blocklistRepository.getById(
      blocklistItemId,
      workspaceId,
    );

    if (!blocklistItem) {
      this.logger.log(
        `Blocklist item with id ${blocklistItemId} not found in workspace ${workspaceId}`,
      );

      return;
    }

    const { handle, workspaceMemberId } = blocklistItem;

    this.logger.log(
      `Deleting messages from ${handle} in workspace ${workspaceId} for workspace member ${workspaceMemberId}`,
    );

    const messageChannels =
      await this.messageChannelRepository.getIdsByWorkspaceMemberId(
        workspaceMemberId,
        workspaceId,
      );

    const messageChannelIds = messageChannels.map(({ id }) => id);

    await this.messageChannelMessageAssociationRepository.deleteByMessageParticipantHandleAndMessageChannelIds(
      handle,
      messageChannelIds,
      workspaceId,
    );

    await this.threadCleanerService.cleanWorkspaceThreads(workspaceId);

    this.logger.log(
      `Deleted messages from handle ${handle} in workspace ${workspaceId} for workspace member ${workspaceMemberId}`,
    );
  }
}
