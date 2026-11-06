import { mentionTokens } from "@headless-lms/core/discussion";
import type { BodyParser, ParsedBody } from "@headless-lms/core/shared/ports";

export class PlainBodyParser implements BodyParser {
  parse(body: string): ParsedBody {
    return { text: body, mentions: mentionTokens(body), assetIds: [] };
  }
}
