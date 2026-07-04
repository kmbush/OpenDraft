/**
 * SSM Parameter Store `Secrets` adapter (DESIGN AD-8, §4.6). Reads the admin
 * passcode hash and the HMAC session key (both SecureString) at cold start and
 * caches them. Secrets never appear in logs or the bundle.
 */
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { Secrets } from '../ports.js';

export interface SecretsConfig {
  passcodeHashParam: string;
  hmacKeyParam: string;
}

export class SsmSecrets implements Secrets {
  private passcodeHash?: string;
  private hmacKey?: string;

  constructor(
    private readonly config: SecretsConfig,
    private readonly client: SSMClient = new SSMClient({}),
  ) {}

  async getPasscodeHash(): Promise<string> {
    this.passcodeHash ??= await this.read(this.config.passcodeHashParam);
    return this.passcodeHash;
  }

  async getHmacKey(): Promise<string> {
    this.hmacKey ??= await this.read(this.config.hmacKeyParam);
    return this.hmacKey;
  }

  private async read(name: string): Promise<string> {
    const res = await this.client.send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );
    const value = res.Parameter?.Value;
    if (!value) throw new Error(`Missing SSM parameter: ${name}`);
    return value;
  }
}
