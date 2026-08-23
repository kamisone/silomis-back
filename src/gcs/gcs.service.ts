import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';

const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class GcsService {
  private readonly logger = new Logger(GcsService.name);
  private readonly storage: Storage;
  private readonly bucketName = process.env.GCS_BUCKET_NAME!;

  constructor() {
    this.storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        private_key_id: process.env.GCS_PRIVATE_KEY_ID,
      },
    });
  }

  async upload(
    buffer: Buffer,
    objectName: string,
    contentType: string,
    predefinedAcl?: 'publicRead' | 'private',
    cacheControl?: string,
  ): Promise<void> {
    try {
      await this.storage
        .bucket(this.bucketName)
        .file(objectName)
        .save(buffer, {
          contentType,
          ...(predefinedAcl ? { predefinedAcl } : {}),
          ...(cacheControl ? { metadata: { cacheControl } } : {}),
        });
    } catch (err: unknown) {
      this.logger.error(`GCS upload failed [${objectName}]: ${JSON.stringify(err)}`);
      throw err;
    }
  }

  /** Streams a large object to a local file — avoids buffering videos in RAM. */
  async downloadToFile(objectName: string, destination: string): Promise<void> {
    await this.storage.bucket(this.bucketName).file(objectName).download({ destination });
  }

  /** Streams a local file to GCS — used for transcode outputs (segments, renditions). */
  async uploadFromFile(
    localPath: string,
    objectName: string,
    contentType: string,
    predefinedAcl?: 'publicRead' | 'private',
    cacheControl?: string,
  ): Promise<void> {
    await this.storage.bucket(this.bucketName).upload(localPath, {
      destination: objectName,
      contentType,
      ...(predefinedAcl ? { predefinedAcl } : {}),
      ...(cacheControl ? { metadata: { cacheControl } } : {}),
    });
  }

  /** Buffers a small object fully into memory — for JSON payloads, not video/large media (use downloadToFile for those). */
  async downloadBuffer(objectName: string): Promise<Buffer> {
    const [buf] = await this.storage.bucket(this.bucketName).file(objectName).download();
    return buf;
  }

  async delete(objectName: string): Promise<void> {
    await this.storage.bucket(this.bucketName).file(objectName).delete({ ignoreNotFound: true });
  }

  async signedUrl(objectName: string): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(objectName)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + SIGNED_URL_TTL_MS,
      });
    return url;
  }

  /** Public CDN URL — only valid when the GCS object has allUsers:objectViewer IAM. */
  publicUrl(objectName: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${objectName}`;
  }
}
