const HELP = {
  mahjong: `
    <h3>Game Objective &amp; Setup</h3>
    <ul>
      <li><strong>Entry Fee:</strong> Starts at 500 credits per hand (random seat, East round).</li>
      <li><strong>Tile Pool:</strong> 136 total tiles (69 live tiles after your initial draw, 14 reserved for the dead wall, and 39 set aside for unseen opponents).</li>
      <li><strong>Net Winnings:</strong> All fees and payouts affect your net score, but winnings do not increase your cumulative earned credits.</li>
    </ul>
    <h3>Gameplay &amp; Actions</h3>
    <ul>
      <li><strong>Discard &amp; Draw:</strong> Costs 50 credits per tile. Click a tile twice or use the button to discard it and draw a new one. Discarding advances both your turn and the opponents' wall consumption.</li>
      <li><strong>Riichi:</strong> Costs 1,000 credits plus the 50-credit replacement fee. Requires a closed hand in tenpai with at least 4 live tiles remaining. Locks your hand to automatic discards, unlocks ura-dora on a win, and enables Double Riichi (2 han) on turn 1 or Ippatsu (1 han) on your next draw. The 1,000-credit stake is returned only if you win.</li>
      <li><strong>Kan (Concealed):</strong> Formed with 4 identical held tiles. Grants a free dead-wall draw, reveals a new dora indicator, and enables <em>Rinshan kaihou</em> (after Riichi, it is allowed only if it doesn't alter your hand structure/waits).</li>
    </ul>
    <h3>Scoring &amp; Hand Rules</h3>
    <ul>
      <li><strong>Standard Riichi Scoring:</strong> Uses standard hand evaluation including Han, Fu, Dora (includes 1 red 5 per suit and additional dora/ura-dora), Yaku, and limit hands (counted/multiple Yakuman enabled; no <em>kiriage mangan</em>).</li>
      <li><strong>Special Yaku:</strong> <em>Haitei</em> applies if you draw the last live tile. <em>Rinshan</em> wins cancel <em>Haitei</em>. No <em>Chankan</em>, <em>Ippatsu</em> across calls, or Heavenly/Earthly hands. Seven Pairs and Thirteen Orphans are valid.</li>
      <li><strong>Opponents:</strong> Opponents only draw from the wall—they do not call tiles, declare wins, or place riichi sticks.</li>
    </ul>
    <h3>Hand Endings &amp; Payouts</h3>
    <ul>
      <li><strong>Tsumo Win:</strong> Pays out the equivalent of a full table score (with dealer bonuses if seated East).</li>
      <li><strong>Exhaustion (No Tiles Left):</strong> Allows one final free discard. If your remaining 13-tile hand is in <strong>Tenpai</strong>, your 500-credit entry fee is refunded (replacement fees are not). If <strong>Not Tenpai</strong>, you receive no refund.</li>
      <li><strong>Quit/Early End:</strong> Quitting early gives no refund.</li>
    </ul>`,
  horse: `
    <h3>Field &amp; Betting Mechanics</h3>
    <ul>
      <li><strong>Field Size:</strong> 12 runners per race grouped into 8 colored brackets (Place pays top 3; same-bracket bets require 2 horses in that bracket). No scratches or ties.</li>
      <li><strong>Payouts:</strong> Credits automatically settle after the race. All outcomes are locked on the server at purchase, so animations simply replay predetermined results.</li>
    </ul>
    <h3>Runner Strength &amp; Selection</h3>
    <ul>
      <li><strong>Selection:</strong> Races draw 6 decorated horses (3+ G1/Jpn1 wins or Hall of Fame) and 6 standard/fictional horses.</li>
      <li><strong>Strength Calculation:</strong> Base Strength (1 + 0.60×G1 wins + 0.08×graded wins + 0.60 for Hall of Fame) multiplied by daily form (70%–130%). Standard/fictional runners use a base strength of 1.</li>
    </ul>
    <h3>Odds &amp; Simulation Model</h3>
    <ul>
      <li><strong>Outcome Simulation:</strong> Finishing positions and combination probabilities are drawn sequentially, proportional to each runner's relative strength.</li>
      <li><strong>Fixed Odds Formula:</strong> Calculated as <span class="game-formula">Return Factor ÷ Probability</span> (min 1.0x, rounded down to 1 decimal).</li>
    </ul>
    <h4>Return Rates</h4>
    <ul>
      <li><strong>Win / Place:</strong> 80%</li>
      <li><strong>Bracket Quinella / Quinella / Wide:</strong> 77.5%</li>
      <li><strong>Exacta / Trio:</strong> 75%</li>
      <li><strong>Trifecta:</strong> 72.5%</li>
    </ul>`,
  gem: `
    <h3>Success Rate Mechanics</h3>
    <ul>
      <li><strong>Base Chance:</strong> Starts at 75% for both rows.</li>
      <li><strong>Rate Adjustments:</strong> Any success lowers the next attempt's chance by 10% (minimum 25%); any miss raises it by 10% (maximum 75%).</li>
    </ul>
    <h3>Cost &amp; Cutting Rules</h3>
    <ul>
      <li><strong>Cost:</strong> 50 credits per cut (1,000 credits total for a full 20-node gem).</li>
      <li><strong>Row Effects:</strong> <strong>Brilliance</strong> successes increase gem value, while <strong>Fracture</strong> successes decrease it.</li>
    </ul>
    <h3>Payout &amp; Profit</h3>
    <ul>
      <li><strong>Formula:</strong> <span class="game-formula">Gross Payout = 45 × (Brilliance² − Fracture²)</span>, with a minimum of 0 (automatically paid after the 20th cut).</li>
      <li><strong>Net Profit:</strong> Subtract the 1,000 credit entry cost from your gross payout (e.g., 6/4 pays 900 gross / -100 net; 10/0 pays 4,500 gross / +3,500 net).</li>
    </ul>`,
  roulette: `
    <h3>Wheel &amp; Payouts</h3>
    <ul>
      <li><strong>37 Pockets Total:</strong> All pockets have equal probability.</li>
      <li><strong>Red / Black:</strong> 18 pockets each — pays <strong>2×</strong> your stake on a win.</li>
      <li><strong>Green:</strong> 1 pocket — pays <strong>35×</strong> your stake on a win.</li>
      <li><strong>Losses:</strong> Incorrect picks return 0. All winning payouts include your original stake.</li>
    </ul>
    <h3>Betting &amp; Game Mechanics</h3>
    <ul>
      <li><strong>Bet Limits:</strong> 1 to 1,000,000 whole credits (up to your available balance).</li>
      <li><strong>Server Processing:</strong> Bets lock before the winning pocket is drawn. Refreshing or leaving the page resumes or completes the spin without losing your outcome or payout.</li>
    </ul>`,
  climb: `
    <h3>Entry &amp; Game Flow</h3>
    <ul>
      <li><strong>Cost:</strong> 500 credits per run (no extra choice fees or early cash-outs).</li>
      <li><strong>Choices:</strong> 10 turns total. Each turn offers 3 randomly selected routes (refreshing maintains your current choices; routes can repeat across turns).</li>
    </ul>
    <h3>Height &amp; Payout Rules</h3>
    <ul>
      <li><strong>Height Changes:</strong> Each route adjusts your height by a random integer range (height cannot drop below 0 m).</li>
      <li><strong>Payout Formula:</strong> Earns <strong>18 credits per 10 m</strong> of final height (rounded down to whole credits).</li>
      <li><strong>Max Payout:</strong> Capped at 1,800 credits at 1,000 m.</li>
      <li><strong>Net Profit:</strong> Gross Payout − 500 credits.</li>
    </ul>`,
};

export const gameHelp = (kind) => `<div class="game-help">${HELP[kind]}</div>`;
