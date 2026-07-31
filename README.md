# Randonnée

Snakes and ladders, regrown as a mountain walk. Built for a phone.

**[Play it →](https://monsharen.github.io/Snakes-and-ladders/)**

The board is not a 10×10 grid. It is a switchback trail of **61 waypoints**
climbing from a valley trailhead at 820 m to a summit cairn at 3 240 m,
through five terrain bands — valley, forest, high pasture, scree, glacier —
drawn as a topographic map with contour lines that never cross.

The snakes and the ladders are the mountain's own:

| Up | Down |
| --- | --- |
| Shepherds' path, switchback shortcut | Swollen ford, rockfall |
| Via ferrata, fixed ropes | Lost the waymarks, twisted ankle |
| The last cable car, the easy ridge | Whiteout, crevasse |
| Glacier traverse | Storm off the col |

## Rules

The principles are the old ones: roll, walk that many waypoints, get carried
up or down by whatever you land on, first to the summit wins. Three options,
all in the menu, all on by default:

- **Grit** — a refuge gives you one (three maximum). Spend one after seeing
  your roll to shift it by a step either way, or to roll again. This is the
  one real decision the original never had.
- **Exact summit** — you have to land on 61. Overshoot and you walk down the
  far side and have to come back.
- **Sixes go again** — three in a row and the altitude catches up with you.

Two to four hikers, any of them on auto. The game remembers an unfinished
walk, so closing the tab mid-climb is safe.

## Running it

Any static server will do — the game uses ES modules, so `file://` will not
work.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

No build step, no dependencies, no network calls at runtime. It installs as a
PWA and plays offline.

To check the trail is still balanced after changing it:

```sh
node tools/simulate.mjs 2000
```

That plays the game a few thousand times with the animation stubbed out and
reports how long games run and how often each seat wins. It runs in CI too,
which is why `game.js` and `trail.js` never touch the DOM.

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main`. It needs **Settings → Pages → Source: GitHub Actions**.

If you would rather not use Actions, **Source: Deploy from a branch → `main`
→ `/ (root)`** works just as well — every path in the project is relative, so
it runs from a project subpath such as `/Snakes-and-ladders/` without changes.
`.nojekyll` is there so Jekyll leaves the files alone.

## Layout

```
index.html            markup and the sheets
styles/main.css       everything visual, including the map
src/trail.js          board geometry, terrain, ascents and descents
src/game.js           rules and the turn loop — no DOM
src/render.js         draws the map, moves the tokens, pans the camera
src/ui.js             the dock, the sheets, the journal, the CPU
src/dice.js           one die
src/audio.js          synthesised sound, no audio files
src/storage.js        saved party, rules and unfinished walk
tools/simulate.mjs    headless balance check
```
