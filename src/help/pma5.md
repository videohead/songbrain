# Import from a Roland PMA-5

Song Brain can read a **PMA-5 backup** (a `.syx` SysEx file) and bring in its songs and user styles.

## Get a backup file

1. Connect the PMA-5 to your computer with a MIDI interface (both MIDI In and MIDI Out).
2. Save the unit's whole memory as a `.syx` file. The free open-source **pma5tool** can do this (`dump backup.syx`), and so can any SysEx librarian program.

## Import it

1. Press **Open…** in the toolbar and choose the `.syx` file.
2. The import window lists the songs and user styles in the backup.

## Songs

**Load chart** puts the song's chords on the chord grid, with its meter and tempo. Chords are named from the PMA-5's chord types, for example `Cmaj7`, `Dm7`, `G7`, `Bb6/9` and slash chords such as `C/E`. Only the chord chart comes across: the PMA-5 song's own note tracks and its style or variation changes are not imported, so pick a style in Song Brain.

## User styles

Tick the styles you want and press **Import**. Each style is converted into a Song Brain style, saved to the style library and added to the song. This uses the same method as **Train style**: the PMA-5 pattern (recorded in C) is read as drums, bass and comping, and swing and timing are measured from it. A multi-bar pattern becomes weighted bar variations.

## Notes

- **Preset styles** are not in a backup, only your user styles. To use a preset, play it on the unit with a chord chart and train from the exported MIDI file instead (see **Train a style from MIDI**).
- **Check the result.** This reader follows published notes on the format and is still being checked against real backups. If a chord or pattern looks wrong, keep the file and report it.
- Backups in the old Roland `.blk` format are not read yet. Convert them to `.syx` first (pma5tool `convert`).
