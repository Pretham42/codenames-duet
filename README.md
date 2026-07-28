# Duet

A cooperative codenames game for exactly two people, played by passing one device back and forth.

No install, no server, no accounts — open `index.html` and play.

---

## Why this design

Regular Codenames needs four players minimum: two spymasters who know the key, two operatives who don't. At two players the whole engine falls apart — if one person knows the key and the other doesn't, the knowing player has nothing to discover.

The fix that actually works is the one Czech Games shipped as **Codenames: Duet**, and after looking around, nothing the community has invented beats it. So this follows Duet's rules faithfully:

**Both players are spymaster and operative at the same time.** You each hold half a key, you give each other clues, and neither of you can see the whole picture.

The key card is the clever part:

| | your key | partner's key |
|---|---|---|
| agents | 9 | 9 |
| assassins | 3 | 3 |
| bystanders | 13 | 13 |

Only **3 agents overlap**, so 9 + 9 collapses into **15 agents** to find between you. Exactly **1 assassin** is shared. Which means the sting in the tail: a word that looks like a harmless bystander on your key can be an *assassin* on your partner's, and you have no way to know. Five words on the board are lethal to somebody.

You get a fixed number of turns for all 15. Run out and you drop into **sudden death** — no more clues, just guesses from what you already worked out, and one wrong tap ends it.

## Making it work on one screen

Physical Duet has both players staring at the same table with their own key card in front of them. On a single device that becomes a pass-and-play problem, and the naive version makes you hand the phone over twice per turn.

This build passes it **once**. When you're holding the device you do both jobs back to back:

1. **Answer** your partner's clue — tap words, keep going while you're right.
2. **Write** your own clue for them.
3. Hand it over.

So the device behaves like your personal console: it only ever shows *your* half of the key, and a full-screen handoff card stands between the two players so nothing leaks.

## Reading the board

| | |
|---|---|
| **pale mint** | an agent on your key — shown only while you're writing a clue |
| **dark red** | an assassin on your key |
| **deep green** | found; contacted, counts for both of you |
| **tan + a numbered dot** | confirmed innocent, and whose key cleared it |
| **plain cream** | nobody has touched it |

While you're *guessing*, your own key shows as a small corner dot rather than a full tint. That's deliberate — it's information you're entitled to in the real game, and since 3 of your agents are also your partner's, it's genuinely worth knowing.

When the game ends, every card splits down the middle: left half is player one's key, right half is player two's. It's the best part of a loss — you get to see exactly which word was going to kill you.

## Options

**Word packs** — 1096 words total, no duplicates.

| pack | words | |
|---|---|---|
| Classic | 411 | the familiar codename vocabulary |
| Expanded | 670 | fresher words you haven't seen a hundred times |
| Double Meanings | 191 | every word pulls two ways; brutal, and the best clues live here |
| Everything | 1096 | all of it, shuffled |

**Difficulty** is your turn budget: Rookie 11, Agent 9 (the standard mission), Veteran 8, Legend 7.

Names, pack, difficulty and your win record persist in `localStorage`.

## Running it

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 4290 --directory codenames-duet
```

## Files

| file | |
|---|---|
| `index.html` | markup for all four screens + the icon sprite |
| `style.css` | all styling; dark theme, responsive down to 375px |
| `game.js` | key generation, turn flow, rendering |
| `words.js` | the word packs |
