/*
  API KEY PANEL (BYOK)

  SkillSync runs on each user's own OpenAI key, so we never pay for (or store) anyone's usage.
  The key lives in sessionStorage (cleared when the tab closes) and is sent to our backend
  with each analysis request, where it's used for that one OpenAI call only.
*/

import { useState } from "react";
import Button from "./ui/Button";

type ApiKeyPanelProps = {
  apiKey: string;
  onSave: (key: string) => void;
  onForget: () => void;
};

function ApiKeyPanel({ apiKey, onSave, onForget }: ApiKeyPanelProps) {
  const [draftKey, setDraftKey] = useState("");

  if (apiKey) {
    return (
      <section className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-[#235c2a]">
        <span>OpenAI key saved for this tab (ending in {apiKey.slice(-4)})</span>
        <button
          type="button"
          onClick={onForget}
          className="text-xs underline underline-offset-2 hover:opacity-70"
        >
          Forget my key
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6 w-full rounded-lg border border-green-900/20 bg-white/80 p-5 text-left shadow-md">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-green-950">
        Your OpenAI API key
      </h2>
      <p className="mt-2 text-xs text-[#4f5f52]">
        SkillSync uses your own OpenAI key. It stays in this browser tab, is sent only with
        your analysis requests, and is never saved on our servers. We recommend creating a
        separate key in its own OpenAI project with a monthly budget, so you can cap spending
        and revoke it anytime.{" "}
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Get a key
        </a>
      </p>
      <form
        className="mt-3 flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (draftKey.trim()) {
            onSave(draftKey.trim());
            setDraftKey("");
          }
        }}
      >
        <input
          type="password"
          autoComplete="off"
          value={draftKey}
          onChange={(event) => setDraftKey(event.target.value)}
          placeholder="sk-..."
          aria-label="OpenAI API key"
          className="min-w-0 flex-1 rounded-md border border-green-900/20 bg-white px-3 py-2 text-sm"
        />
        <Button type="submit">Save key</Button>
      </form>
    </section>
  );
}

export default ApiKeyPanel;
