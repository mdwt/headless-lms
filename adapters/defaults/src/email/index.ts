// Default when no EmailSender is injected — fails loudly on use.
import type {
  EmailSender,
  EmailMessage,
  EmailTemplateId,
  Logger,
  TemplateRenderer,
} from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class EmailAdapter implements EmailSender {
  constructor(private readonly logger: Logger = noopLogger) {}

  async send(_message: EmailMessage): Promise<void> {
    this.logger.error("email send failed: no transport configured");
    throw new Error("not implemented");
  }
}

export class StubTemplateRenderer implements TemplateRenderer {
  constructor(private readonly logger: Logger = noopLogger) {}

  async render(id: EmailTemplateId): Promise<never> {
    this.logger.error("template render failed: no renderer configured", { id });
    throw new Error("no template renderer configured");
  }
}

export class FileSinkEmailAdapter implements EmailSender {
  private sequence = 0;

  constructor(
    private readonly dir: string,
    private readonly logger: Logger = noopLogger,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${stamp}-${String(++this.sequence).padStart(4, "0")}`;
    await writeFile(join(this.dir, `${name}.json`), JSON.stringify(message, null, 2));
    if (message.html) {
      await writeFile(join(this.dir, `${name}.html`), message.html);
    }
    this.logger.info("email written to sink", {
      to: message.to,
      subject: message.subject,
      file: name,
    });
  }
}
