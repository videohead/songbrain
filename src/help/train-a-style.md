# Train a style from MIDI

A **style** is how Song Brain plays a chord chart: comping rhythm, bass line, drums and feel. You don't write styles by hand. You train them by submitting a MIDI file of a chord chart you know, played by **any MIDI application**: a DAW, an intelligent automatic accompaniment program, or a MIDI accompaniment generator program.

## The idea

1. Take a chart Song Brain knows (the built-in **Training chart** is designed for this).
2. Enter that same chart in any MIDI application, choose the style or groove you want to capture, and export the result as a MIDI file. A DAW, an intelligent automatic accompaniment program and a MIDI accompaniment generator all work, as does a hardware arranger.
3. Give the MIDI file back to Song Brain. It listens to what each instrument did over each chord and turns that into a reusable style.

## Step by step

1. Open **Help → Training chart** and click **Load training chart**. The chart replaces the song in the editor.
2. Enter the same chords in your MIDI application, one chord per bar, 4/4, and choose the style you want to capture.
3. Export the verse feel (**substyle A**) as a type 1 MIDI file. If the style also has a busier chorus feel (**substyle B**), export that as a second file.
4. In Song Brain press **Train style** in the top bar.
5. Pick the A file, give the style a name, and press **Train**. The result shows which tracks were heard as comping, bass or drums, plus the measured swing and timing push.
6. Optional: choose **Substyle B**, pick the style you just trained, add the B file and train again. B is merged into the same style.
7. The style is saved to the library and set as the song's default. Select it any time from the **Style** menu.

## Tips for good results

- **Match the chart exactly.** The chord on every bar must be the chord that was played. The trainer uses the chart to tell root from fifth and to tag hits by chord type.
- **One chord per bar** keeps the harmony unambiguous and stops the application from substituting chords.
- **Count-ins and endings are detected.** Leading silence is skipped and a trailing ending is kept as the style's ending.
- **Use at least 8 bars per substyle.** More bars give more weighted variations per role.
- **Pattern length** is 1 bar by default. Use 2 for styles that clearly repeat every two bars.
- **Start bar** is auto-detected. Only set it if the result is shifted.
- **Type 1 MIDI** keeps instruments on separate tracks. A type 0 file mixes everything and can't be separated.

## Where styles are saved

Each style is one JSON file in the repository's `styles/` folder. Commit them with git to keep and share them. You can also train from the command line:

```
npx tsx scripts/dev/learnStyle.ts my-a.mid --id mystyle --name "My Style" --chords "Cmaj7,Am7,..."
npx tsx scripts/dev/learnStyle.ts my-b.mid --id mystyle --substyle b --chords "Cmaj7,Am7,..."
```

## Troubleshooting

- **"Substyle B needs an existing style"**: train A first, with the same id.
- **Tracks are ignored**: the trainer sorts tracks by note range and content. Check the report and make sure bass and drums are on their own tracks (drums on channel 10).
- **Timing feels off**: check the start bar in the report. A count-in the trainer didn't detect shifts every bar.
- **Validation errors**: the file didn't produce a usable style, usually because the chart and MIDI don't match.
