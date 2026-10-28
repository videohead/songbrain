# Create a chart

You build a chart one bar at a time. Each bar is a box in the grid, and each box holds one or more chords.

## 1. Set up the song

In the transport bar set the **title**, **key** (a label, e.g. `C`), **tempo** and **meter** (`4/4`, `3/4`, `6/8`…). The meter decides how many beats each bar has.

## 2. Add bars and sections

A song is made of **sections** (Verse, Chorus, A, B…), and each section is a row of bars.

- Press **+ Bar** in a section to add a bar at the end. New bars start as `N.C.` (no chord).
- Press **+ Add section** at the bottom for a new section, and rename it by typing in its header.
- Select a bar and press **Insert after** to add a bar in the middle, or **Delete** to remove it.
- **Row** sets how many bars show per row. It only changes the layout, not the music.

## 3. Type the chords

Double-click a bar (or select it and press **Enter**), type the chords, then press **Enter** to accept or **Esc** to cancel.

One chord fills the whole bar:

```
Cmaj7
```

Separate several chords with a space or a **|** and they share the bar equally. These are the same:

```
Dm7 G7
Dm7 | G7
```

That puts Dm7 on beats 1–2 and G7 on beats 3–4 of a 4/4 bar.

For uneven splits add the number of beats after a colon:

```
Dm7:3 G7:1
```

Use `N.C.` for a bar of silence.

## Chord symbols

Common spellings all work: `C`, `Cm7`, `Cmaj7`, `C7b9`, `Bb/D`, and diminished chords such as `Cdim`, `Cdim7` and `Cm7b5`. See **Chord symbols** in this Help for the full list of variants. The **Analysis** toggle shows each chord's Roman numeral and function, which is a handy check that you typed what you meant.

## 4. Work faster

- **Click** a bar to select it, **Shift+click** to select a range, then **Copy**, **Paste** or **Delete**.
- Paste overwrites from the selected bar onwards and adds bars if the song runs out.
- Repeated sections: copy a whole section's bars and paste them into a new section.

## 5. Listen and refine

Press **▶**. The playing bar is highlighted. Turn on **Loop** to repeat the song. Change the **Style** to hear the same chords played another way, and open the **Mixer** to change instruments.

## Let the agent do it

Open the agent panel (the network button in the top bar) and ask in plain language: "Add a ii–V before bar 8", "Transpose to Bb" or "Make the last four bars a turnaround". The agent changes the same chart, and you can undo it like any other edit.
