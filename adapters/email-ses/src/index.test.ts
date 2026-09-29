import { describe, it, expect } from "vitest";
import type { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SesEmailAdapter } from "./index.js";

/** Fake SES client capturing sent commands. */
function fakeClient(error?: Error) {
  const commands: SendEmailCommand[] = [];
  const client = {
    send: async (command: SendEmailCommand) => {
      commands.push(command);
      if (error) {
        throw error;
      }
      return { MessageId: "ses_123" };
    },
  };
  return { commands, client };
}

describe("SesEmailAdapter", () => {
  it("sends a SendEmailCommand with the configured sender and message content", async () => {
    const { commands, client } = fakeClient();
    const adapter = new SesEmailAdapter(
      { region: "eu-west-1", from: "LMS <noreply@example.com>" },
      undefined,
      client,
    );

    await adapter.send({ to: "student@example.com", subject: "Welcome", text: "Hi there" });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.input).toEqual({
      FromEmailAddress: "LMS <noreply@example.com>",
      Destination: { ToAddresses: ["student@example.com"] },
      Content: {
        Simple: {
          Subject: { Data: "Welcome", Charset: "UTF-8" },
          Body: { Text: { Data: "Hi there", Charset: "UTF-8" } },
        },
      },
    });
  });

  it("includes an html body when the message has one", async () => {
    const { commands, client } = fakeClient();
    const adapter = new SesEmailAdapter(
      { region: "eu-west-1", from: "a@b.c" },
      undefined,
      client,
    );

    await adapter.send({ to: "s@e.com", subject: "Hi", text: "plain", html: "<p>rich</p>" });

    expect(commands[0]?.input.Content?.Simple?.Body?.Html).toEqual({
      Data: "<p>rich</p>",
      Charset: "UTF-8",
    });
  });

  it("omits the html body when the message has none", async () => {
    const { commands, client } = fakeClient();
    const adapter = new SesEmailAdapter(
      { region: "eu-west-1", from: "a@b.c" },
      undefined,
      client,
    );

    await adapter.send({ to: "s@e.com", subject: "Hi", text: "plain" });

    expect(commands[0]?.input.Content?.Simple?.Body?.Html).toBeUndefined();
  });

  it("passes the configuration set when configured", async () => {
    const { commands, client } = fakeClient();
    const adapter = new SesEmailAdapter(
      { region: "eu-west-1", from: "a@b.c", configurationSetName: "transactional" },
      undefined,
      client,
    );

    await adapter.send({ to: "s@e.com", subject: "Hi", text: "plain" });

    expect(commands[0]?.input.ConfigurationSetName).toBe("transactional");
  });

  it("rethrows SES errors and logs the failure", async () => {
    const { client } = fakeClient(new Error("Email address is not verified"));
    const logged: unknown[] = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (msg: string, meta?: unknown) => {
        logged.push({ msg, meta });
      },
    };
    const adapter = new SesEmailAdapter({ region: "eu-west-1", from: "a@b.c" }, logger, client);

    await expect(
      adapter.send({ to: "student@example.com", subject: "Welcome", text: "Hi" }),
    ).rejects.toThrow(/not verified/);
    expect(logged).toHaveLength(1);
  });
});
