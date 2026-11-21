# Q4 reading questions and answer key

Written before any reader ran. Readers get `solutions/KD.tsrx` (`share.open`) or `solutions/PY.tsrx` (`sharesheet.open`).
The two files differ only in that name. Both use Markless's `shared()` (a named state every caller shares) and
`storage()` (a value kept across reloads, in a cookie the server reads) beside device imports.

## Questions (message 1, one variant)

1. For each imported name, say what it is and what it does here.
2. What happens on each button press, and who else sees the result?
3. Does any name look like something else you know? Did it make you unsure?

Message 2 shows both versions' differing lines and asks which name reads clearer next to `shared` and whether either can
be mistaken for something.

## Key (question 1, one point per name; question 2, one point per button)

- `shared`: Markless; makes `readingList`, state that every component calling `readingList()` gets the same copy of.
- `state`: Markless; mutable state that updates the page.
- `storage`: Markless; a value kept across reloads (text size), keyed `'text-size'`.
- `location`: device; the person's live position (not the page URL, `window.location`).
- `network`: device; the connection, `online` false when offline (not an HTTP client).
- `notifications`: device; schedules a local notification an hour from now that opens the article.
- `settings`: device; opens the app's page in the phone's Settings (not an in-app settings page or app config).
- `share` / `sharesheet`: device; opens the system share panel.
- "Text size": toggles normal/large; kept across reloads; only this person.
- "Save for later": adds the article to the reading list shared inside the app; other parts of the app see it; nothing
  is sent to other people.
- "Share": opens the system share panel with the title and url.
- "Remind me in an hour": schedules a local notification; tapping it opens the article.
- "Turn on location in Settings": opens the phone's Settings for this app.

## Tallies (question 3, and any misreading in 1–2)

Per name: readers who confused it with a Markless name or a browser global, and with what. In particular: `share` with
`shared` (or "Save for later" read as sharing with others), `location` with `window.location`, `settings` with an in-app
page or config, `network` with fetch/HTTP, `notifications` with the browser Notification API or permission prompt.
