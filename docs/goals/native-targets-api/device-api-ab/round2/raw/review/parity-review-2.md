I found five fixes worth making in KJ and two small polish items shared by JR and ZK, plus one optional KJ change. Tasks 3, 7 and 8 have no parity problems, and nothing in KJ, JR or ZK uses anything its sheet does not declare. The camera rewrite (`<camera el={cam} />` in JR, ZK and their `<mapview>`/`<player>` equivalents) is applied consistently in every task.

## Findings

**1. KJ, task 5: the button acts as if recording after access is refused (a real bug).** `recording` is the writer's own state. After `onDenied` sets it to false, pressing Record sets it to true again: the label flips to "Stop" and the seconds line appears, but nothing records. JR, ZK, WZ and DU all read `recording` from the device, so they never show this. Fix: add `disabled={denied}` to the button. Alternatively, guard the click with `if (denied) return;`.

**2. KJ, task 5: a second recording can briefly show the last one's seconds.** `seconds` keeps its old value until the first `onTick` arrives. The KJ sheet doesn't say `onTick` fires 0 at start, while the other designs' seconds reset on `start()`. Fix: set `seconds = 0` when starting, e.g. `onClick={() => { if (!recording) seconds = 0; recording = !recording; }}`.

**3. KJ, task 6: any location failure is reported as refusal.** `catch { refused = true; }` shows "Location access is off." even for a timeout or other failure. The KJ sheet says `current()` "can wait, fail or be refused" and rejects with `NotAllowedError` on refusal. DU checks `error.name === 'NotAllowedError'` for the same message. Fix: `catch (error) { refused = (error as Error).name === 'NotAllowedError'; }`.

**4. KJ, task 6: inconsistent variable name.** KJ uses `refused` here but `denied` in tasks 1 to 5, matching its own `onDenied` / `ui-denied`. Fix: rename it `denied`.

**5. KJ, tasks 1 to 4: hard-to-read shutter handler.**
- Tasks 1 to 3 use `photo = (await cam?.takePhoto()) ?? photo;`, and task 4 uses `?? null` instead. The `?? photo` fallback makes the reader wonder whether `takePhoto()` can return nothing. On `CameraElement` it returns `Promise<Photo>`; only the separate static `device.camera.takePhoto()` resolves null.
- This is the only shutter line in any design that needs a second look. JR's task 2 already uses the clearer form `if (cam) s.last = await cam.takePhoto();`.
- Fix: use `if (cam) photo = await cam.takePhoto();` in all four tasks.

**6. JR and ZK, task 2: the shared-photo file is clunkier than WZ's.**
- The file is `shots.tsrx` but has no markup; WZ's equivalent is `shot.ts`.
- The body is `const box = state(...); return box;` where one expression would do.
- Each user names the instance `s` (`s.last`). No other solution uses a one-letter name for app state, so it reads less clearly than DU's or KJ's `photo`.

Fix for both: rename to `shots.ts` and write `export const shots = shared(() => state<{ last: Photo | null }>({ last: null }));`. In Header and Body, use `const shot = shots();` and `shot.last`.

**7. JR and ZK, task 6 (optional): the map object is named `m`.** The others use `view` (DU) or `cityMap` (WZ), and `<m.pin>` is the least self-explanatory line in the task. Fix: `const map = mapview(...)` and `<map.pin>`.

**8. KJ, task 8 (optional):** `device.compass.heading` appears twice in one long template. JR, ZK and DU bind the value to a short name first. You could add `const compass = device.compass;` to match. This is cosmetic.

## Task by task
1. **Task 1:** No parity problems beyond item 5. ZK checks `cam.denied` and also uses `<camera.error>`. That is justified, because the ZK sheet doesn't say `<camera>` hides itself when access is refused (WZ's `camera.area` does).
2. **Task 2:** Items 5 and 6. KJ and DU have the same shape, passing the camera handle and the ready flag down from Page. JR and ZK rely on `named()` being live while Header renders before Body; their sheet says it is, so that's fine. ZK's disabled fallback button is a reasonable consequence of `of: Camera` not accepting null.
3. **Task 3:** No parity problems (only item 5's shutter line). In every design a refusal shows only "Camera access is off.", the repeat filter is identical, and the "Last code" format is identical.
4. **Task 4:**
   - Item 5 applies, including the `?? null` / `?? photo` mismatch.
   - KJ's comment correctly cites its sheet ("leaving the markup releases it"), and it resets `ready` on close like DU.
   - JR's and ZK's comments match WZ's in wording and accuracy. Their shutter stays visible but disabled while the panel is up, as in WZ; KJ and DU swap the camera out entirely. That is a legitimate difference in shape.
5. **Task 5:** Items 1 and 2 (KJ only). JR, ZK, WZ and DU are at parity: same label, same `${n} s` format, same refusal message.
6. **Task 6:** Items 3 and 4 (KJ), item 7 (JR and ZK). The search pages and the `places.ts` lists of places are identical across KJ, JR, ZK and DU.
7. **Task 7:** No parity problems. All use m:ss and the same Play/Pause labels; ZK's parts mirror WZ's.
8. **Task 8:** No parity problems. Same banner markup, same `Heading:` format with rounding and an empty value before the first reading.

One possible confusion comes from the sheets, not the solutions. The JR and ZK sheets say a device "starts when its element is on screen", but the recorder (and network and compass) have no element. Task 5 works fine through `start()`, but a careful reader may notice the gap.

All files read are under `/Users/jackshelton/wt/markless/device-api-round2/docs/goals/native-targets-api/device-api-ab/round2/`. Nothing was modified.