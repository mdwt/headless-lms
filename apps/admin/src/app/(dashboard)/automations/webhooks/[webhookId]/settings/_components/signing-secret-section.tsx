"use client";

import { useState, useTransition } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { revealWebhookSecretAction, rotateWebhookSecretAction } from "../../../actions";

const MASKED = "whsec_••••••••••••••••••••••••••••••••";

export function SigningSecretSection({ webhookId }: { webhookId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function loadSecret(): Promise<string> {
    if (secret) return secret;
    const revealed = await revealWebhookSecretAction(webhookId);
    setSecret(revealed);
    return revealed;
  }

  function onToggleVisible() {
    if (visible) {
      setVisible(false);
      return;
    }
    startTransition(async () => {
      try {
        await loadSecret();
        setVisible(true);
      } catch (err) {
        toast.error("Couldn't reveal the secret", { description: (err as Error).message });
      }
    });
  }

  function onCopy() {
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(await loadSecret());
        toast.success("Signing secret copied");
      } catch (err) {
        toast.error("Couldn't copy the secret", { description: (err as Error).message });
      }
    });
  }

  function onConfirmRotate() {
    startTransition(async () => {
      try {
        setSecret(await rotateWebhookSecretAction(webhookId));
        setVisible(true);
        setConfirmingRotate(false);
        toast.success("Signing secret rotated");
      } catch (err) {
        toast.error("Couldn't rotate the secret", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSection
      title="Signing secret"
      description="Verify that deliveries came from this LMS. Each request carries webhook-id, webhook-timestamp and webhook-signature headers, signed with this secret per the Standard Webhooks spec."
      footer={
        <Button variant="secondary" onClick={() => setConfirmingRotate(true)} disabled={isPending}>
          Rotate secret
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <Input
          readOnly
          aria-label="Signing secret"
          value={visible && secret ? secret : MASKED}
          className="font-mono text-sm"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleVisible}
          disabled={isPending}
          aria-label={visible ? "Hide secret" : "Reveal secret"}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCopy}
          disabled={isPending}
          aria-label="Copy secret"
        >
          <Copy />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingRotate}
        onOpenChange={setConfirmingRotate}
        title="Rotate signing secret?"
        description="The current secret stops working immediately. Update your endpoint to verify with the new secret."
        confirmLabel="Rotate secret"
        destructive
        pending={isPending}
        onConfirm={onConfirmRotate}
      />
    </SettingsSection>
  );
}
