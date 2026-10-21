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

### Test 3: the store listing (Android app, coming later)

On the Google Play Store, open the Kerckhoffs page, then "About this app" and "App permissions". You will **not** find "Full network access". Without that permission, Android forbids the app from connecting to the internet. It is your phone that blocks it, not a promise from us.

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
- **Mobile app, coming later**: it will also block screenshots and hide its content in the list of open apps.
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
