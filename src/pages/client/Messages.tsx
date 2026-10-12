import { useClientSelf } from '../../lib/session';
import { Thread } from '../../components/Thread';

export function ClientMessages() {
  const { client, practice } = useClientSelf();
  return (
    <>
      <h1 style={{ fontSize: 26 }}>Messages</h1>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)', minHeight: 360 }}>
        <Thread clientId={client.id} practiceId={practice.id} as="client" placeholder={`Message ${practice.name}`} />
      </section>
    </>
  );
}
