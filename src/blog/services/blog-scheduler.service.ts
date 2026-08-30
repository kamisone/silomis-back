import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisLockService } from '../../common/redis-lock/redis-lock.service';
import { CRON_LOCK_TTL } from '../../common/redis-lock/cron-lock.constants';
import { BlogPostService } from './blog-post.service';

@Injectable()
export class BlogSchedulerService {
  private readonly logger = new Logger(BlogSchedulerService.name);

  constructor(
    private readonly posts: BlogPostService,
    private readonly lock: RedisLockService,
  ) {}

  // The API Deployment is horizontally scaled, so this tick fires once per
  // replica. The lock keeps it to one publish pass per minute cluster-wide.
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledPosts(): Promise<void> {
    await this.lock.runOncePerWindow(
      'blog-publish-scheduled',
      CRON_LOCK_TTL.minute,
      () => this.publish(),
    );
  }

  private async publish(): Promise<void> {
    try {
      const count = await this.posts.publishDue();
      if (count > 0)
        this.logger.log(`Auto-published ${count} scheduled blog post(s)`);
    } catch (err) {
      this.logger.error('Failed to auto-publish scheduled posts', err);
    }
  }
}
