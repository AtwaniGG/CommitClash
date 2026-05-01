import Link from "next/link";
import { PixelFrame } from "@/components/ui/PixelFrame";

export const metadata = {
  title: "COMMITCLASH // WHITEPAPER",
  description:
    "Technical specification for COMMITCLASH — fully on-chain Rock-Paper-Scissors on Solana with commit-reveal moves, FIFO matchmaking, real $RPS burns, and session-key auto-reveal.",
};

const SECTIONS = [
  { id: "abstract", n: "00", label: "ABSTRACT" },
  { id: "vision", n: "01", label: "VISION" },
  { id: "protocol", n: "02", label: "PROTOCOL" },
  { id: "moves", n: "03", label: "MOVES" },
  { id: "matchmaking", n: "04", label: "MATCHMAKING" },
  { id: "session-keys", n: "05", label: "SESSION KEYS" },
  { id: "economics", n: "06", label: "ECONOMICS" },
  { id: "tokenomics", n: "07", label: "$RPS TOKENOMICS" },
  { id: "security", n: "08", label: "SECURITY" },
  { id: "audit", n: "09", label: "AUDIT" },
  { id: "roadmap", n: "10", label: "ROADMAP" },
  { id: "addresses", n: "11", label: "ADDRESSES" },
  { id: "faq", n: "12", label: "FAQ" },
];

const Divider = () => (
  <div
    aria-hidden
    className="text-pixel-xs text-edge-bright select-none my-10 truncate"
  >
    {"═".repeat(120)}
  </div>
);

const SectionHeader = ({ n, label }: { n: string; label: string }) => (
  <div className="space-y-2">
    <div className="text-pixel-xs text-ink-mute">{">"} SECTION_{n}</div>
    <h2 className="text-pixel-lg glow-cyan">{label}</h2>
  </div>
);

export default function WhitepaperPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      {/* HEAD */}
      <div className="space-y-2">
        <div className="text-pixel-xs text-ink-mute">DOSSIER.SOL</div>
        <h1 className="text-pixel-xl glow-magenta">COMMITCLASH</h1>
        <h2 className="text-pixel-md glow-cyan">{">"} WHITEPAPER v0.1</h2>
        <p className="font-body text-xl text-ink-dim leading-snug max-w-2xl pt-2">
          Fully on-chain Rock-Paper-Scissors on Solana. Commit-reveal moves.
          FIFO matchmaking. Session-key auto-reveal. Real burns. Zero house.
        </p>
        <div className="text-pixel-xs text-ink-mute pt-2">
          REV 2026-05-01 · DEPLOYED · DEVNET
        </div>
      </div>

      {/* INDEX */}
      <PixelFrame title="INDEX" tone="cyan">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-sm">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-ink-dim hover:text-cyan transition-colors"
            >
              <span className="text-ink-mute">{s.n}</span> // {s.label}
            </a>
          ))}
        </div>
      </PixelFrame>

      <Divider />

      {/* 00 ABSTRACT */}
      <section id="abstract" className="space-y-4 scroll-mt-24">
        <SectionHeader n="00" label="ABSTRACT" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          COMMITCLASH is a Solana program that lets two players stake $RPS
          tokens against each other in a single round of Rock-Paper-Scissors.
          Moves are sealed using a keccak256 commit-reveal scheme so neither
          player can see the other's choice before locking in their own.
          Matches are paired via a first-in-first-out queue, settle atomically
          on-chain, and pay out 85% to the winner. 7.5% of each pot is burned
          via a real <span className="font-mono">spl_token::burn</span> CPI —
          decreasing $RPS supply on-chain — and 7.5% accrues to the protocol
          treasury. There is no house, no oracle, no admin override on game
          outcomes, and no off-chain matchmaker.
        </p>
      </section>

      <Divider />

      {/* 01 VISION */}
      <section id="vision" className="space-y-4 scroll-mt-24">
        <SectionHeader n="01" label="VISION" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          On-chain games today fall into two camps: <span className="text-acid">slow
          and trustworthy</span> (Ethereum, full settlement on every move,
          $20+ in fees), or <span className="text-cyan">fast and
          custodial</span> (Web2 wrappers that take wallets but route trades
          through their own backends). COMMITCLASH chooses neither.
        </p>
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          Solana lets us run a full PvP game with cryptographic move secrecy,
          atomic settlement, and sub-cent fees — entirely on-chain. The
          design uses a session-key delegation pattern so the user signs
          one transaction per game while still preserving the security
          guarantees of two-phase commit-reveal. The result is a game that
          plays as fast as a Web2 product and settles as cleanly as a smart
          contract.
        </p>
        <PixelFrame title="DESIGN_PRINCIPLES" tone="default">
          <ul className="font-body text-base text-ink-dim space-y-2 leading-snug">
            <li>▶ <span className="glow-cyan">Custody zero.</span> Tokens never leave the player's wallet except into a program-owned vault, and only when entering a match.</li>
            <li>▶ <span className="glow-cyan">Move secrecy.</span> Cryptographically guaranteed via commitment hash. Front-running impossible.</li>
            <li>▶ <span className="glow-cyan">No house edge.</span> 85% of every pot returns to a player. The remaining 15% is a flat protocol fee.</li>
            <li>▶ <span className="glow-cyan">Real deflation.</span> Half of the protocol fee burns from total supply, on-chain, every game.</li>
            <li>▶ <span className="glow-cyan">One-click UX.</span> Session-key delegation keeps the wallet popup count at one per match.</li>
          </ul>
        </PixelFrame>
      </section>

      <Divider />

      {/* 02 PROTOCOL */}
      <section id="protocol" className="space-y-4 scroll-mt-24">
        <SectionHeader n="02" label="PROTOCOL ARCHITECTURE" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          The COMMITCLASH program is an Anchor 0.31.1 Solana program. State
          is split across seven account types, all program-derived:
        </p>
        <PixelFrame title="STATE // ACCOUNTS" tone="acid">
          <table className="w-full font-mono text-sm">
            <thead className="text-pixel-xs text-ink-mute">
              <tr className="border-b border-edge">
                <th className="text-left py-2 pr-3">PDA</th>
                <th className="text-left py-2 pr-3">SEEDS</th>
                <th className="text-left py-2">PURPOSE</th>
              </tr>
            </thead>
            <tbody className="text-ink-dim">
              <Row pda="Config" seeds='["config"]' purpose="Admin, mint, treasury, reveal timeout. Singleton." />
              <Row pda="GlobalStats" seeds='["stats"]' purpose="Lifetime aggregates: rounds, burned, treasury, volume." />
              <Row pda="Pool" seeds='["pool", id]' purpose="Per-tier pool: entry amount, queue head/tail, next match id." />
              <Row pda="PoolStats" seeds='["pool_stats", id]' purpose="Per-pool counters." />
              <Row pda="QueueEntry" seeds='["entry", id, idx]' purpose="One pending player + commitment + session key." />
              <Row pda="Match" seeds='["match", id, mid]' purpose="Paired game state; commitments, reveals, pot, slot_matched." />
              <Row pda="PlayerStats" seeds='["player", wallet]' purpose="Cross-pool: wins, losses, ties, streak, volume." />
            </tbody>
          </table>
        </PixelFrame>
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          State is mutated by eight instructions. Two are admin-only
          (<span className="font-mono">initialize</span>,{" "}
          <span className="font-mono">initialize_pool</span>). Five are
          player-facing. One is permissionless and serves as the
          liveness escape valve for stale queues and forfeited matches.
        </p>
      </section>

      <Divider />

      {/* 03 MOVES */}
      <section id="moves" className="space-y-4 scroll-mt-24">
        <SectionHeader n="03" label="MOVES" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          Moves are encoded as a single byte: <span className="font-mono glow-magenta">0x01 ROCK</span>,{" "}
          <span className="font-mono glow-cyan">0x02 PAPER</span>,{" "}
          <span className="font-mono glow-acid">0x03 SCISSORS</span>. The
          standard cycle applies: Rock crushes Scissors, Paper covers Rock,
          Scissors cuts Paper. Any other byte rejects with{" "}
          <span className="font-mono">InvalidMove</span>.
        </p>
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          Each player generates a fresh 32-byte random nonce per match and
          computes:
        </p>
        <PixelFrame title="COMMITMENT" tone="magenta">
          <pre className="font-mono text-sm overflow-x-auto leading-relaxed">
            <span className="text-cyan">commitment</span>{" = "}<span className="text-acid">keccak256</span>(<br />
            {"  "}<span className="text-ink">move_byte</span>{" || "}
            <span className="text-ink">nonce</span>{" || "}
            <span className="text-ink">player_pubkey</span><br />
            )
          </pre>
        </PixelFrame>
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          Including the player's pubkey in the preimage prevents commitment
          replay across players. Including the nonce prevents brute-forcing
          a 1-of-3 move from the hash alone (3 candidates × 2^256 hashes is
          computationally infeasible).
        </p>
      </section>

      <Divider />

      {/* 04 MATCHMAKING */}
      <section id="matchmaking" className="space-y-4 scroll-mt-24">
        <SectionHeader n="04" label="MATCHMAKING" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          Each pool maintains a single FIFO queue with strict mutual
          exclusion: at most one queue entry exists at a time. Two
          instructions implement the queue contract:
        </p>
        <PixelFrame title="QUEUE_INSTRUCTIONS" tone="cyan">
          <ul className="font-body text-base text-ink-dim space-y-3 leading-snug">
            <li>
              <span className="font-mono glow-cyan">join_solo</span> —
              required when <span className="font-mono">queue_tail == queue_head</span>.
              Stakes the entry amount, registers commitment + session
              key, increments tail.
            </li>
            <li>
              <span className="font-mono glow-magenta">join_and_match</span> —
              required when <span className="font-mono">queue_tail &gt; queue_head</span>.
              Stakes the entry amount, consumes the queued entry,
              creates a Match account with both commitments + session
              keys, increments head.
            </li>
          </ul>
          <div className="text-pixel-xs text-ink-mute mt-4 pt-3 border-t border-edge leading-relaxed">
            Frontend reads pool state to choose the correct instruction.
            Race conditions resolve cleanly: a stale call fails with{" "}
            <span className="font-mono">QueueEmpty</span> or{" "}
            <span className="font-mono">QueueNotEmpty</span> and the client
            retries with the other.
          </div>
        </PixelFrame>
      </section>

      <Divider />

      {/* 05 SESSION KEYS */}
      <section id="session-keys" className="space-y-4 scroll-mt-24">
        <SectionHeader n="05" label="SESSION KEYS" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          A naive commit-reveal protocol requires two wallet signatures per
          match: one to commit, one to reveal. COMMITCLASH compresses this
          to a single popup using a delegated signing key.
        </p>
        <PixelFrame title="SESSION_KEY_FLOW" tone="default">
          <ol className="font-body text-base text-ink-dim space-y-3 leading-relaxed list-decimal list-inside">
            <li>
              On <span className="text-cyan">Play</span>, the frontend
              generates a fresh ephemeral Ed25519 keypair locally. The
              public key is the <span className="font-mono">session_key</span>;
              the secret stays in browser memory + localStorage, never
              touching a server.
            </li>
            <li>
              The user signs ONE transaction (<span className="font-mono">join_solo</span> or{" "}
              <span className="font-mono">join_and_match</span>) which
              registers the session pubkey on-chain alongside their
              commitment.
            </li>
            <li>
              When the match is created, the frontend silently builds and
              submits the <span className="font-mono">reveal</span>{" "}
              transaction signed by the session key. No second wallet
              popup.
            </li>
            <li>
              The on-chain handler accepts a reveal signed by either the
              player's main wallet OR the registered session key for
              that match's side.
            </li>
          </ol>
          <div className="text-pixel-xs text-ink-mute mt-4 pt-3 border-t border-edge leading-relaxed">
            The session key has zero fund authority. Its only on-chain
            power is calling <span className="font-mono">reveal</span> for
            its specific match. Compromise of the session key cannot
            drain wallet funds.
          </div>
        </PixelFrame>
      </section>

      <Divider />

      {/* 06 ECONOMICS */}
      <section id="economics" className="space-y-4 scroll-mt-24">
        <SectionHeader n="06" label="ECONOMICS" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          Each pool defines a fixed entry amount that is locked when a
          player joins. The pot equals 2× the entry. Distribution depends
          on outcome:
        </p>
        <PixelFrame title="POT_DISTRIBUTION" tone="acid">
          <table className="w-full font-mono text-sm">
            <thead className="text-pixel-xs text-ink-mute">
              <tr className="border-b border-edge">
                <th className="text-left py-2 pr-3">OUTCOME</th>
                <th className="text-right py-2 pr-3">WINNER</th>
                <th className="text-right py-2 pr-3">LOSER</th>
                <th className="text-right py-2 pr-3 glow-burn">BURN</th>
                <th className="text-right py-2 glow-acid">TREASURY</th>
              </tr>
            </thead>
            <tbody className="text-ink-dim">
              <tr className="border-b border-edge/30">
                <td className="py-2 pr-3">WIN</td>
                <td className="py-2 pr-3 text-right glow-ok">85.0%</td>
                <td className="py-2 pr-3 text-right">0%</td>
                <td className="py-2 pr-3 text-right glow-burn">7.5%</td>
                <td className="py-2 text-right glow-acid">7.5%</td>
              </tr>
              <tr className="border-b border-edge/30">
                <td className="py-2 pr-3">TIE</td>
                <td className="py-2 pr-3 text-right glow-ok">42.5%</td>
                <td className="py-2 pr-3 text-right glow-ok">42.5%</td>
                <td className="py-2 pr-3 text-right glow-burn">7.5%</td>
                <td className="py-2 text-right glow-acid">7.5%</td>
              </tr>
              <tr className="border-b border-edge/30">
                <td className="py-2 pr-3">FORFEIT</td>
                <td className="py-2 pr-3 text-right glow-ok">85.0%</td>
                <td className="py-2 pr-3 text-right">0%</td>
                <td className="py-2 pr-3 text-right glow-burn">7.5%</td>
                <td className="py-2 text-right glow-acid">7.5%</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-ink-mute">DUAL TIMEOUT*</td>
                <td className="py-2 pr-3 text-right">refund</td>
                <td className="py-2 pr-3 text-right">refund</td>
                <td className="py-2 pr-3 text-right">0%</td>
                <td className="py-2 text-right">0%</td>
              </tr>
            </tbody>
          </table>
          <div className="text-pixel-xs text-ink-mute mt-4 pt-3 border-t border-edge leading-relaxed">
            * Safety fallback only — never triggered in normal play. Session-key
            auto-reveal makes this case effectively impossible. The branch
            exists so funds can never be stranded.
          </div>
        </PixelFrame>
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          <span className="glow-cyan">Streak rules:</span> a win increments
          your <span className="font-mono">current_streak</span> and updates{" "}
          <span className="font-mono">best_streak</span> if higher. A loss
          resets to zero. <span className="text-acid">A tie freezes the streak — neither
          increment nor reset.</span>{" "}
          The frontend triggers a celebration animation when{" "}
          <span className="font-mono">current_streak</span> crosses 3, 5,
          or 10.
        </p>
      </section>

      <Divider />

      {/* 07 TOKENOMICS */}
      <section id="tokenomics" className="space-y-4 scroll-mt-24">
        <SectionHeader n="07" label="$RPS TOKENOMICS" />
        <PixelFrame title="MINT // SUPPLY" tone="magenta">
          <table className="w-full font-mono text-sm">
            <tbody className="text-ink-dim">
              <Row label="TOTAL SUPPLY" value="1,000,000,000 $RPS" />
              <Row label="DECIMALS" value="6" />
              <Row label="LAUNCH" value="Pump.fun bonding curve" />
              <Row label="MINT AUTHORITY" value="None (burn-only deflation)" />
              <Row label="FREEZE AUTHORITY" value="None" />
              <Row label="DEFLATION" value="7.5% of every pot, on-chain" />
            </tbody>
          </table>
        </PixelFrame>
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          $RPS launches via pump.fun with the standard 1B token supply. No
          mint authority means new $RPS can never be created post-launch.
          The protocol's only economic mechanic is <span className="text-acid">deflation via game burn</span>:
          every resolved match permanently destroys 7.5% of its pot via
          a real <span className="font-mono">spl_token::burn</span> CPI.
          The mint's <span className="font-mono">supply</span> field
          decreases on every game and is visible on Solscan, Birdeye,
          Dexscreener, and Jupiter.
        </p>
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          <span className="glow-cyan">No insider allocation. No vested
          team supply. No private sale.</span> Every token enters
          circulation through the pump.fun curve. The protocol takes a
          7.5% fee per game which accrues to the treasury and is used for
          development, marketing, and (when SOL pools are added) buybacks.
        </p>
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          Pool entry amounts are fixed and immutable. The first pool is
          POOL_30K with a 30,000 $RPS entry — approximately $2 USD at the
          pump.fun graduation market cap of ~$69k. As $RPS price changes,
          new pool tiers are launched (10k, 100k, 300k, 1M, etc.) by the
          admin. Existing pool entry amounts never change.
        </p>
      </section>

      <Divider />

      {/* 08 SECURITY */}
      <section id="security" className="space-y-4 scroll-mt-24">
        <SectionHeader n="08" label="SECURITY" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          The COMMITCLASH program holds player stakes in escrow during a
          match. Several invariants are enforced on-chain:
        </p>
        <PixelFrame title="INVARIANTS" tone="default">
          <ul className="font-body text-base text-ink-dim space-y-3 leading-snug">
            <li>▶ <span className="glow-cyan">Move secrecy.</span> Reveal verifies <span className="font-mono">keccak256(move ‖ nonce ‖ pubkey) == commitment</span>. A wrong nonce or move rejects with <span className="font-mono">InvalidReveal</span>.</li>
            <li>▶ <span className="glow-cyan">Account binding.</span> Vault, treasury, mint, and player token accounts are all PDA-bound or address-pinned via Anchor constraints. Substitution attempts revert.</li>
            <li>▶ <span className="glow-cyan">Session-key uniqueness.</span> All four key slots (player_a, session_a, player_b, session_b) must be pairwise distinct. Enforced at join time. Prevents reveal-classifier ambiguity attacks.</li>
            <li>▶ <span className="glow-cyan">Liveness.</span> Permissionless <span className="font-mono">cancel_queue_entry</span> after timeout means a stuck queue can always be unblocked. Permissionless <span className="font-mono">resolve_timeout</span> after timeout means a stuck match always eventually settles.</li>
            <li>▶ <span className="glow-cyan">Deterministic distribution.</span> All outcomes use exact integer math. Pool entry amounts must be divisible by 20 so 7.5% / 42.5% / 85% splits leave zero dust.</li>
            <li>▶ <span className="glow-cyan">Real burn.</span> The 7.5% burn invokes <span className="font-mono">spl_token::burn</span> from the Vault PDA's authority — no mint-level burn authority required, no off-chain dependency.</li>
          </ul>
        </PixelFrame>
      </section>

      <Divider />

      {/* 09 AUDIT */}
      <section id="audit" className="space-y-4 scroll-mt-24">
        <SectionHeader n="09" label="AUDIT" />
        <p className="font-body text-xl text-ink-dim leading-relaxed">
          The program was reviewed by an independent code reviewer pre-launch.
          Findings:
        </p>
        <PixelFrame title="FINDINGS_LOG" tone="cyan">
          <ul className="font-body text-base text-ink-dim space-y-3 leading-snug">
            <li>
              <span className="text-pixel-xs text-burn mr-2">[H1]</span>
              <span className="text-ink">Adversarial session-key registration.</span>{" "}
              Player B could set session_key_b equal to player A's wallet,
              locking A out of revealing with their main wallet and
              forcing forfeit. Patched: all four key slots must be
              pairwise distinct, enforced at join time. Validated and
              redeployed.
            </li>
            <li>
              <span className="text-pixel-xs text-acid mr-2">[M1]</span>
              <span className="text-ink">Treasury overwrite on admin update.</span>{" "}
              <span className="font-mono">admin_update_config</span>{" "}
              previously rewrote the treasury account on every call, even
              when the caller only intended to update the timeout. Patched:
              treasury update now requires explicit{" "}
              <span className="font-mono">update_treasury: bool</span>{" "}
              flag.
            </li>
            <li>
              <span className="text-pixel-xs text-cyan mr-2">[INFO]</span>
              <span className="text-ink">Move secrecy, account substitution, replay, foreign stat tampering, queue griefing, CPI signer seeds, tie-streak invariance, dust math at 30k tier — all verified secure.</span>
            </li>
          </ul>
        </PixelFrame>
      </section>

      <Divider />

      {/* 10 ROADMAP */}
      <section id="roadmap" className="space-y-4 scroll-mt-24">
        <SectionHeader n="10" label="ROADMAP" />
        <PixelFrame title="ROADMAP // TIMELINE" tone="acid">
          <ul className="font-body text-base text-ink-dim space-y-4 leading-snug">
            <li>
              <span className="text-pixel-xs text-ok mr-2">[DONE]</span>
              <span className="text-ink">Devnet program v0.1</span> —
              core game live, audited, patched, upgraded.
            </li>
            <li>
              <span className="text-pixel-xs text-ok mr-2">[DONE]</span>
              <span className="text-ink">Frontend</span> — cyberpunk UI,
              wallet integration, session-key flow, live event feed,
              real-time stats.
            </li>
            <li>
              <span className="text-pixel-xs text-acid mr-2">[NEXT]</span>
              <span className="text-ink">$RPS launch</span> — pump.fun
              token deployment, mainnet program migration, first POOL_30K
              opens.
            </li>
            <li>
              <span className="text-pixel-xs text-cyan mr-2">[Q3]</span>
              <span className="text-ink">SOL pools</span> — alternative
              entry currency for low-friction onboarding. Manual
              treasury-funded $RPS buybacks.
            </li>
            <li>
              <span className="text-pixel-xs text-cyan mr-2">[Q4]</span>
              <span className="text-ink">Higher tiers</span> — POOL_100K,
              POOL_1M opened as $RPS price stabilizes.
            </li>
            <li>
              <span className="text-pixel-xs text-magenta mr-2">[FUTURE]</span>
              <span className="text-ink">Tournament mode</span> — bracket-style
              elimination across pools. Prize pools funded by entry
              percentages.
            </li>
            <li>
              <span className="text-pixel-xs text-magenta mr-2">[FUTURE]</span>
              <span className="text-ink">Multi-sig treasury</span> — Squads
              migration for treasury custody.
            </li>
          </ul>
        </PixelFrame>
      </section>

      <Divider />

      {/* 11 ADDRESSES */}
      <section id="addresses" className="space-y-4 scroll-mt-24">
        <SectionHeader n="11" label="ADDRESSES" />
        <PixelFrame title="ON-CHAIN_REFERENCE" tone="magenta">
          <table className="w-full font-mono text-xs md:text-sm">
            <tbody className="text-ink-dim">
              <Address
                label="PROGRAM"
                addr="DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG"
                cluster="devnet"
              />
              <Address
                label="$RPS MINT (devnet)"
                addr="AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL"
                cluster="devnet"
              />
              <Address
                label="TREASURY (devnet)"
                addr="8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC"
                cluster="devnet"
              />
            </tbody>
          </table>
          <div className="text-pixel-xs text-ink-mute mt-4 pt-3 border-t border-edge leading-relaxed">
            Mainnet addresses published here on $RPS launch.
          </div>
        </PixelFrame>
      </section>

      <Divider />

      {/* 12 FAQ */}
      <section id="faq" className="space-y-4 scroll-mt-24">
        <SectionHeader n="12" label="FAQ" />
        <Faq q="Why commit-reveal instead of just submitting a move?">
          A simple "submit your move" instruction would leak your move
          on-chain to anyone watching. The second player would always win.
          Commit-reveal seals your move cryptographically until both
          players have committed.
        </Faq>
        <Faq q="What's a session key and why do I sign only once?">
          When you click Play, the site generates a fresh single-use
          keypair in your browser. That key gets registered on-chain
          alongside your commitment. When you're matched, the site
          silently uses that key to submit your reveal — no second wallet
          popup. The session key has no fund authority; it can only sign
          one specific reveal.
        </Faq>
        <Faq q="What if my browser crashes mid-match?">
          You have 10 minutes to come back and reveal. Your localStorage
          holds the session key. If it's still there, the site
          auto-reveals as soon as you reload. If localStorage was wiped,
          a "Reveal Manually" button lets you reveal with your wallet.
          If you never reveal at all and your opponent did, they win by
          forfeit after 10 minutes. If neither of you reveals (effectively
          impossible — would require both players' clients to fail
          simultaneously), the program refunds both stakes after the
          timeout.
        </Faq>
        <Faq q="How do I know the burn is real?">
          The 7.5% burn calls the SPL Token program's{" "}
          <span className="font-mono">burn</span> instruction directly,
          which decreases the mint's <span className="font-mono">supply</span>{" "}
          field on-chain. Solscan, Birdeye, Dexscreener, and Jupiter all
          read this field — you'll see the supply curve drop in real time
          on every aggregator.
        </Faq>
        <Faq q="Can the admin steal my stake?">
          No. Admin authority only covers updating the reveal timeout
          and the treasury address. Admin cannot pause matches, redirect
          a vault, change pool entry amounts, or reverse a result.
          Outcomes are determined entirely by the on-chain verification of
          revealed moves against committed hashes.
        </Faq>
        <Faq q="What happens if my opponent never reveals?">
          After 10 minutes, anyone (including you) can call{" "}
          <span className="font-mono">resolve_timeout</span> on your
          match. If you revealed but they didn't, you win by forfeit and
          receive 85% of the pot. Standard 7.5% burn and 7.5% treasury
          fees still apply.
        </Faq>
        <Faq q="Is there an audit?">
          Pre-launch independent review found one HIGH-severity griefing
          attack and one MEDIUM-severity admin operational concern. Both
          were patched and the program upgraded. See SECTION 09 for
          details. A third-party audit by a security firm is on the
          roadmap before mainnet.
        </Faq>
      </section>

      <Divider />

      <div className="text-center pt-10 pb-20 space-y-4">
        <div className="text-pixel-md glow-magenta">{">"} READY TO PLAY?</div>
        <Link
          href="/play/0"
          className="pixel-btn pixel-btn--magenta inline-flex"
        >
          ▶ ENTER POOL_30K
        </Link>
      </div>
    </div>
  );
}

/* ----- helpers ----- */

function Row(props: any) {
  if (props.pda) {
    return (
      <tr className="border-b border-edge/30">
        <td className="py-2 pr-3 text-cyan">{props.pda}</td>
        <td className="py-2 pr-3 font-mono text-xs">{props.seeds}</td>
        <td className="py-2">{props.purpose}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-edge/30 last:border-0">
      <td className="py-2 pr-3 text-pixel-xs text-ink-mute">{props.label}</td>
      <td className="py-2 text-right text-ink">{props.value}</td>
    </tr>
  );
}

function Address({
  label,
  addr,
  cluster,
}: {
  label: string;
  addr: string;
  cluster: "devnet" | "mainnet";
}) {
  return (
    <tr className="border-b border-edge/30 last:border-0">
      <td className="py-2 pr-3 text-pixel-xs text-ink-mute whitespace-nowrap">
        {label}
      </td>
      <td className="py-2">
        <a
          href={`https://explorer.solana.com/address/${addr}?cluster=${cluster}`}
          target="_blank"
          rel="noopener"
          className="text-cyan hover:text-acid transition-colors break-all"
        >
          {addr}
        </a>
      </td>
    </tr>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-edge pl-4 space-y-2">
      <div className="text-pixel-sm glow-cyan">▶ {q}</div>
      <p className="font-body text-lg text-ink-dim leading-relaxed">
        {children}
      </p>
    </div>
  );
}
