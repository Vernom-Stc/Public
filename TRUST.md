# Why you can trust Kerckhoffs

*A plain-language page for everyone.*

## In one sentence

**Kerckhoffs never connects to the internet.** Your documents stay on your phone. The only thing that goes to an AI is the redacted PDF you have checked and chosen to send yourself.

## Don't take our word for it: check

You don't need any technical knowledge to verify this.

### Test 1: airplane mode (30 seconds)

1. Turn on **airplane mode** on your phone. Turn off Wi-Fi too.
2. Open Kerckhoffs.
3. Take a photo of a document, redact it, export the PDF.

**Everything works.** An app that needed to send your data somewhere else could not do its job without a connection.

### Test 2: the old phone (for the extra careful)

1. Take an old phone with no SIM card.
2. Install Kerckhoffs (you need internet once, for the installation).
3. Turn off Wi-Fi **for good**.
4. Use this phone only to redact your documents.

That phone becomes a closed box: there is no physical way for it to send anything. You then move the redacted PDF to your computer with a cable.

### Test 3: the author's signature

Tap "Vérifier ma version" on the home screen. It shows a fingerprint such as `9A71-FC92-65A0-DC72`, which must match the one published for that release in [VERSIONS.md](VERSIONS.md) at the official address.

From then on, that version never changes by itself, online or offline, until you delete it. If a new release exists, Kerckhoffs only tells you; you go and get it yourself, and it is checked file by file before it is offered. If anyone other than the author changed a single byte, for instance by taking over the repository, the update is refused and a red banner warns you.

One honest limit: on the web, the browser has the last word on updates. For sensitive use (lawyers, doctors, public services), use the **frozen version**: one signed file, downloadable from the home screen, that opens with a double-click, works offline and never updates itself.

### Test 4: who is the author of Kerckhoffs?

Kerckhoffs has no face, on purpose. Its author is recognised by one thing only: they are the only one who can sign with the Kerckhoffs seal.

If someone claims to be the author, challenge them:

1. Pick a sentence that includes today's date, for example "Kerckhoffs, 3 November 2026, green apple".
2. Ask them to send it back signed with the seal.
3. Paste the signed message into Kerckhoffs, under "Vérifier un message de l'auteur" (check a message from the author).

If the signature is valid, it is them. If not, it is not the author, whatever they say. Because you choose the sentence and the date, nobody can replay an old signature found elsewhere. The challenge proves who holds the seal without revealing anything about the author's identity. If the seal ever changes, the change is announced in a message signed with the old seal, and the challenge carries on with the new one.

## What leaves your phone, and what doesn't

| | Leaves your phone? |
|---|---|
| Your original photos and documents | **No, never** |
| The names and words you type to hide them | **No, never** |
| The redacted PDF | **Only if you send it yourself** to an AI |

Kerckhoffs stops once the redacted PDF is created. If you then send it to ChatGPT, Claude or another AI, you are the one doing it, after seeing it on screen.

## What stays on your phone

**The only file Kerckhoffs ever writes on your phone is the PDF that is already redacted.** Even if it ended up online one day, it would not contain your data.

- **Photos taken with Kerckhoffs's own camera** stay in its working memory and vanish when you close it. They never go through your gallery. If you refuse camera access, the phone's camera app opens instead, and it may save the photo to your gallery.
- **Hidden metadata** in photos (GPS location, date, phone model) is removed from everything Kerckhoffs exports.
- **Screenshots**: Kerckhoffs cannot prevent them. While you work, the image carries an "ORIGINAL · NOT REDACTED · DO NOT SEND" stamp, so any screenshot of the original shows it. Only the exported copy is clean.
- **Kerckhoffs is on no app store.** One official address only: if you found it on the App Store or Google Play, it is a copy.
- **Careful with imported documents**: if you import a photo or PDF already on your phone, the original stays where it was, and it may already be backed up to the cloud. For a sensitive document, photograph it directly from Kerckhoffs instead.

Kerckhoffs does not control your phone itself. If you want a complete guarantee, use the offline old phone from Test 2.

## Why "open source" is a guarantee

Kerckhoffs's code is **public**. Anyone can read it: developers, journalists, schools, consumer groups. If the app secretly sent your data somewhere, it would show, and people would know.

You don't need to read the code yourself. It is enough that others can.

## What Kerckhoffs does not do for you

To be honest: no tool is perfect.

- Automatic detection can **miss** a name or a number, especially on a blurry photo or handwriting.
- **Always review** every page before exporting, and hide by hand anything left over.
- A document can reveal who you are even without your name (a town, an employer, a very precise amount). Hide whatever you feel says too much.

Kerckhoffs helps a lot. The final check is you.

---

*Kerckhoffs is provided as is, under the Apache 2.0 license. Copy it, adapt it, share it freely.*
