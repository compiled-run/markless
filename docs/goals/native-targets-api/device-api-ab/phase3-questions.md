# Phase 3: reading questions and answer key

Written before any reader ran. Readers get the reference solutions for tasks 2, 3 and 6 for each design, and answer each question for each design. Each answer scores 1 (matches the key), 0.5 (partly right or hedged between a right and a wrong answer) or 0. The design 6 (BC) column was added after phase 1, when that design was written, and before any phase 2 consumer or reader ran.

## Questions (the text readers get)

Task 2, camera:
- Q1. If the person refuses camera access, what do they see on screen?
- Q2. Which camera (front or back) is used at the start?
- Q3. After the shutter is pressed, where does the photo end up?
- Q4. Is the camera view one element on screen, or several elements working together?

Task 3, location:
- Q5. What does the person see while the location is loading?
- Q6. If the person refuses location access, what do they see?
- Q7. The person taps "Open Settings", turns location on, and comes back to the app. What happens next, and does the page update by itself?
- Q8. What exactly does "Try again" do?

Task 6, voice memo:
- Q9. What stops the recording?
- Q10. Where does the elapsed-seconds number come from?
- Q11. How is the finished clip played back?

## Key

| Q | EJ | UW | AU | KO | MS | BC |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | The preview is replaced by the "Camera access is off" message; shutter and switch buttons still show | The error part shows the "Camera access is off" message; shutter and switch buttons still show | The preview and shutter are replaced by the message; the switch button still shows | The message, and no preview, shutter or switch button (before the first answer an "Allow camera" button shows instead) | The preview is replaced by the message; shutter and switch buttons still show | The preview is replaced by the message; shutter and switch buttons still show |
| Q2 | Back | Back | Back (`environment`) | Back | Back | Back |
| Q3 | In an image below the camera (via the view's change event into state) | In an image below the camera (via the root's change event into state) | In an image below the camera (blob turned into a URL in state) | In an image below the camera (handle's promise into state) | In an image below the camera (capture's promise into state) | In an image below the camera (capture's promise into state) |
| Q4 | One | Several (a root holding a preview area, a shutter trigger and an error part) | One | One | One | One (a plain `<video>`) |
| Q5 | "Finding your location…" | same as EJ | same as EJ | same as EJ | same as EJ | same as EJ |
| Q6 | A message plus "Open Settings" and "Try again" buttons | same | same | same | same | same |
| Q7 | Nothing changes until they tap "Try again" | same as EJ | same as EJ | The load re-runs by itself, because it reads the live permission state; "Try again" also works | "Try again" reads again; whether the status updates by itself is not shown in this code, so either "only after Try again" or "the live status may update it" scores 1 if the reader names `refresh()` behind the button | same as EJ |
| Q8 | Runs the failed location load again (`reset`) | same as EJ | same as EJ | Runs the load again, which asks for permission again if it still can, then reads the location | Calls `refresh()` on the location object, which reads again and asks again if it can | same as EJ |
| Q9 | Pressing the Stop button (`rec.stop()`) | Pressing the same record trigger a second time | Pressing Stop, which stops the `MediaRecorder` and the timer | Pressing Stop (`AudioRecorder.stop()`) | Pressing the Stop button (`rec.stop()`) | Pressing Stop, which stops the recording handle and the timer |
| Q10 | The recorder object's live `elapsed` field | The recorder's value-label part fills it in | A one-second timer the app starts itself in `memo.ts` | Progress events from the recorder, through a listener added while recording | The recorder object's live `elapsed` field | A one-second timer the app starts itself in `memo.ts` |
| Q11 | An `<audio controls>` element with the clip's URL | same | same (URL made from the recorded blobs) | same (clip `uri`) | same | same |
