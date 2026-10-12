import { useState } from 'react';
import type { Client, Practice } from '../lib/types';
import { Icon } from './ui';

export function inviteUrl(code: string) {
  return `${window.location.origin}/invite/${code}`;
}

/** Copy/share the client's invite link. Uses the phone's share sheet when available. */
export function InviteLink({ client, practice }: { client: Client; practice: Practice }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(client.invite_code);
  const text = `Hi ${client.first_name}! Here’s your link to your ${practice.name} skin portal. You’ll see your plan and routine, and send your check-ins here: ${url}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input grow" readOnly value={url} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn" onClick={copy}><Icon name="copy" size={18} />{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="row">
        {typeof navigator.share === 'function' && (
          <button type="button" className="btn soft" onClick={() => navigator.share({ title: practice.name, text })}>Share…</button>
        )}
        <a className="btn soft" href={`sms:?&body=${encodeURIComponent(text)}`}>Text it</a>
        {client.email && <a className="btn soft" href={`mailto:${client.email}?subject=${encodeURIComponent(`Your ${practice.name} skin portal`)}&body=${encodeURIComponent(text)}`}>Email it</a>}
      </div>
    </div>
  );
}
