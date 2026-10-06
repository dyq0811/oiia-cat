# OIIA Kitten Runner

A tiny endless-runner game, like Chrome's dinosaur game, starring the spinning OIIA cat.
Jump over cucumbers, vacuums, spray bottles and bees!

## Run it

Download the files, then start a local server inside the folder:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 in your browser.

> The voice control needs the page served from `localhost` or `https`. Opening `index.html` directly works for keyboard play only.

## How to play

| Action | Control |
| --- | --- |
| Start / restart | `0` |
| Jump | `Space` or shout **"oi!"** |
| Change speed | `1` Low · `2` Medium · `3` High |
| Pause / resume | `P` or `Esc` |

- Every game starts at **Low** speed. Change it any time during a run.
- Bees show up after 200 points. Low bees: jump. High bees: run under.

## Voice control

1. Click **Enable "oi!" mic** and allow microphone access.
2. Shout "oi!" to jump.
3. Use the **Sensitivity** slider if it's too jumpy or not reacting. The red mark on the meter is the trigger level.

## Credits

The OIIA cat image is from the official [W&W "OIIA OIIA (Spinning Cat)"](https://www.wandwmusic.com/oiia) page.
