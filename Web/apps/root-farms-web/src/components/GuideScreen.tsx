export function GuideScreen() {
  return (
    <div className="screen guide-screen">
      <header className="guide-header">
        <h1>How Root Farms works</h1>
        <p className="guide-lead">
          A plain-language guide to growing crops, earning Root Units, protecting your fields, and comparing your balance with other players.
        </p>
      </header>

      <p className="guide-disclaimer" role="note">
        <strong>Please note:</strong> Game rules, income rates, costs, varmint behavior, and other details may change at any time without notice. What you read here describes how the game works today, not a permanent promise.
      </p>

      <article className="guide-section">
        <h2>What is Root Farms?</h2>
        <p>
          Root Farms is a farming game tied to your Root Record account. You unlock crop plots, add rows, wait for crops to finish growing, and earn <strong>Root Units</strong> — the same balance you see in your account and in Discord. The more active rows you run, the more you can earn over time.
        </p>
      </article>

      <article className="guide-section">
        <h2>Your balance</h2>
        <p>
          At the top of the game you see your <strong>available Root Units</strong>. That number is your real spendable balance across Root Record, not a separate fake wallet.
        </p>
        <p>
          While crops are growing, part of your earnings may show as <strong>Pending Harvest</strong>. Use <strong>Harvest now</strong> to move that pending amount into your available balance. You can only harvest manually about once per minute — the game also settles earnings in the background when you play or return after being away.
        </p>
      </article>

      <article className="guide-section">
        <h2>Plots and rows</h2>
        <p>
          Each <strong>plot</strong> is a type of crop (for example onion, potato, or another entry in the catalog). Plots start locked until you meet their unlock requirement, usually based on how much you have earned over your lifetime on this farm.
        </p>
        <p>
          Inside a plot you add <strong>rows</strong>. Each row you activate contributes to that plot&apos;s income. Rows have a growing cycle: when the cycle completes, you earn Root Units for that harvest. Open a plot to see its grow time, how much each harvest pays, and how many rows you can add.
        </p>
        <p>
          You spend Root Units to unlock new plots and to add more rows. Plan spending between expanding to new crops and deepening rows on crops you already run.
        </p>
      </article>

      <article className="guide-section">
        <h2>Earning and income rate</h2>
        <p>
          Your farm produces income based on which plots are unlocked, how many rows are active, and each crop&apos;s payout per harvest. The game may show an <strong>income rate</strong> (Root Units per second) as a handy summary — it is derived from your current setup, not a fixed global number.
        </p>
        <p>
          Income rates, grow times, unlock costs, and per-harvest payouts can be tuned as the game evolves. Always check your plots in-game for current numbers.
        </p>
      </article>

      <article className="guide-section">
        <h2>Farmhands (field protection)</h2>
        <p>
          The <strong>Farmhands</strong> tab is where you hire protection for your fields. This is not a shop for seeds or gear — it is three optional plans you turn on or off:
        </p>
        <ul className="guide-list">
          <li>
            <strong>Gopher protection</strong> — helps stop gophers from damaging a random active row on one of your plots.
          </li>
          <li>
            <strong>Field mice protection</strong> — helps stop mice from destroying an entire row (crop and slot).
          </li>
          <li>
            <strong>Rabbit protection</strong> — helps stop rabbits from clearing every row on a random plot. Rabbits attack less often than other varmints, but hurt more when they get through.
          </li>
        </ul>
        <p>
          While a plan is <strong>on</strong>, your farm&apos;s <strong>income rate</strong> is reduced by that plan&apos;s percentage (1% for gopher or field mice, 3% for rabbit). This is not taken from your spendable balance — you simply earn slightly slower. All active plans stack (up to 5% slower with every plan on). You can toggle plans anytime when signed in.
        </p>
      </article>

      <article className="guide-section">
        <h2>Varmints and notifications</h2>
        <p>
          Gophers, field mice, and rabbits can attack farms across the game world on a schedule you do not control. When something happens to your farm, you may get a popup alert and an entry under Farmhands notifications.
        </p>
        <p>
          If the matching protection was on, the attack is blocked and you will see that in the message. If protection was off, you may lose rows or progress until you repair or replant as the game allows.
        </p>
      </article>

      <article className="guide-section">
        <h2>Welcome back</h2>
        <p>
          If you were away for a while, the game may show a <strong>welcome back</strong> summary when you return. It explains what happened while you were gone — earnings settled, attacks, or blocked attacks — so you can catch up quickly.
        </p>
      </article>

      <article className="guide-section">
        <h2>Root Economy</h2>
        <p>
          <strong>Root Economy</strong> shows a live leaderboard of the top balances in the game. You can optionally set a <strong>public display name</strong> in your account settings on the Root Record website; otherwise the board shows a shortened wallet-style address. Discord usernames from your profile may appear when linked.
        </p>
        <p>This board is for fun and bragging rights — it does not change how your farm earns.</p>
      </article>

      <article className="guide-section">
        <h2>Replant and Settings</h2>
        <p>
          <strong>Replant</strong> is planned for a future update (prestige-style resets with long-term bonuses). It is not available yet.
        </p>
        <p>
          <strong>Settings</strong> holds account-related options for the game shell. Sign-in uses your normal Root Record account; sign out here if you need to switch users on a shared device.
        </p>
      </article>

      <article className="guide-section guide-section--tips">
        <h2>Quick tips</h2>
        <ul className="guide-list">
          <li>Check pending harvest before spending your last Root Units on upgrades.</li>
          <li>Balance row upgrades on your best plots with unlocking new crops.</li>
          <li>Turn on farmhand protection when you cannot check the game often — weigh the income-rate reduction against varmint risk.</li>
          <li>Read Farmhands notifications after an alert so you know whether an attack was blocked.</li>
        </ul>
      </article>
    </div>
  );
}
