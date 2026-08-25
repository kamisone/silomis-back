import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlogPostService } from './blog-post.service';

@Injectable()
export class BlogSchedulerService {
  private readonly logger = new Logger(BlogSchedulerService.name);

  constructor(private readonly posts: BlogPostService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledPosts(): Promise<void> {
    try {
      const count = await this.posts.publishDue();
      if (count > 0)
        this.logger.log(`Auto-published ${count} scheduled blog post(s)`);
    } catch (err) {
      this.logger.error('Failed to auto-publish scheduled posts', err);
    }
  }
}
