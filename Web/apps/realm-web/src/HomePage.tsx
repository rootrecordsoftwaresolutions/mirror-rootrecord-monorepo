export default function HomePage() {
  return (
    <main className="page">
      <h1>Root Record Realm</h1>
      <p className="muted">
        Public Minecraft Notes player profiles, shared worlds, and friends — built for RootMC and
        the BlockNotes app.
      </p>
      <div className="card">
        <p>
          Open a profile at <code>/player/your_realm_username</code> or{" "}
          <code>/player/account_id</code>.
        </p>
        <p className="muted">
          Set your Realm username and share worlds in the Minecraft Notes app under More → Realm.
        </p>
      </div>
    </main>
  );
}
