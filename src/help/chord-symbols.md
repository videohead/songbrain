# Chord symbols

Type chords the way they appear on a lead sheet. Use `b` for flat and `#` for sharp, and capitalise the root (`Bb`, `F#`). The root letter is case-insensitive when you type it, so `bb7` is read as `Bb7`.

## Basic chords

```
C        major
Cm       minor        (also Cmin, C-)
C6       major sixth
C7       dominant seventh
Cmaj7    major seventh   (also CM7, CΔ)
Cm7      minor seventh   (also Cmin7, C-7)
```

## Diminished chords

There are two different diminished sounds, so be specific:

```
Cdim     diminished triad            (also C° or Co)
Cdim7    fully diminished seventh    (also C°7 or Co7)
Cm7b5    half-diminished seventh     (also Cø or Cø7)
```

- **Cdim7** stacks minor thirds (C, Eb, Gb, A) and is often used as a passing chord, e.g. `Edim7` between `Ebmaj7` and `Bb/F`.
- **Cm7b5** is the ii chord of a minor ii–V–I: `Dm7b5 | G7b9 | Cm7`.

## Variants and alterations

```
Cmaj9   C9   C13           extended chords
C7b9    C7#9   C7b5   C7#5   C7#11   C7b13     altered dominants
C7alt                      a general altered dominant
C7(b9,#11)                 several alterations in brackets
Cm(maj7)                   minor with a major seventh   (also CmM7)
Caug    C+    C7#5         augmented
Csus4   Csus2   C7sus4     suspended   (C7sus also works)
Cadd9   C2                 added ninth
C6/9                       six-nine
```

## Slash chords

Put the bass note after a slash:

```
Bb/D     Bb major with D in the bass
C/G      C major over G
```

## Rests

```
N.C.     no chord (the band stops)
```

## If a chord isn't recognised

Song Brain plays the closest simpler chord it understands, dropping the part it can't read (an unusual alteration or extension first). The chord symbol you typed is kept in the chart, so the lead sheet and MusicXML still show it exactly as you wrote it.

## Several chords in one bar

Separate them with a space or a `|`, and add `:beats` for uneven splits. See **Create a chart** for the details.

```
Dm7 G7            two chords, two beats each
Dm7 | G7          the same thing
Dm7:3 G7:1        three beats then one
Em7b5 A7b9        a minor ii–V in one bar
```
