# Reading test, round 2: questions and answer key

Written before any reader ran. Readers get the reference solutions for tasks 1, 3, 4, 5 and 6 in each of five designs (order shuffled per reader), with no sheet and no docs. Task 5 was added to the brief's tasks 1, 3, 4 and 6 so readers can be asked about a device that shows nothing on screen (the planner's question about `<device.recorder />`). Each answer scores 1 (matches the key), 0.5 (partly right, or hedged between a right and a wrong answer) or 0.

## Questions (the text readers get)

- Q1 (task 1). If the person refuses camera access, what do they see on screen?
- Q2 (task 1). What happens if the person presses the shutter before the camera is ready?
- Q3 (task 1). Is the camera view one element on screen, or several elements working together?
- Q4 (task 3). How does the code hear about QR codes, and how are repeats ignored?
- Q5 (task 4). When exactly is the camera released (switched off), and what turns it back on?
- Q6 (task 5). What starts and stops the recording, and is anything on screen for the recorder itself?
- Q7 (task 6). How does choosing a result on the search page move the map?
- Q8 (task 6). What does "Recenter on me" do?

## Key

| Q | WZ | JR | ZK | DU | KJ |
| --- | --- | --- | --- | --- | --- |
| Q1 | The picture is hidden; the "Camera access is off" message and an Open Settings button show; the shutter and flip buttons stay | The picture is replaced by the message and Open Settings; shutter (disabled) and flip stay | The picture is hidden; the error part shows the message and Open Settings; shutter (disabled) and flip stay | The picture is replaced by the message and Open Settings; shutter (disabled) and flip stay | The picture is replaced by the message and Open Settings; shutter (disabled) and flip stay |
| Q2 | Nothing: the shutter part is disabled until ready | Nothing: the button is disabled until `cam.ready` (and the capture would wait anyway) | Nothing: the shutter part is disabled until ready | Nothing: the button is disabled until `onReady` sets ready | Nothing: the button is disabled until `onReady` sets ready (and the capture would wait anyway) |
| Q3 | Several (a root holding a picture area, a shutter trigger and an error part) | One | One picture element, plus separate shutter and error parts tied to the same object; "one" or "one plus parts" both score 1 | One | One |
| Q4 | The root's `onCode` event (with `scan` on); the handler skips a code equal to the last one | A callback given to `cam.scan(...)`; it skips a code equal to the last one | Same as JR | The camera element's `onCode` event (with `scan`); skips a code equal to the last one | The camera element's `onScan` event (with `scan={['qr']}`); skips a code equal to the last one |
| Q5 | When the photo is taken: `active` on the root becomes false while the review panel shows; closing the panel sets it true again | After the photo is taken the handler sets `cam.active = false`; Close sets it back to true | Same as JR (set in the shutter part's `onPhoto`) | When the photo is taken the camera element is removed from the page by the `@if`; Close puts it back | When the photo is taken the camera element is removed from the markup by the `@if`; Close puts it back |
| Q6 | The recorder's trigger part starts and stops it; nothing shows for the recorder except its parts (button, seconds label, error) | The button calls `rec.start()` / `rec.stop()`; nothing on screen is the recorder | The recorder trigger part (given the object) starts and stops it; nothing on screen is the recorder itself | The button calls `rec.start()` / `rec.stop()`; nothing on screen is the recorder | The button flips the app's `recording` state; an invisible `<device.recorder active={recording}>` element records while it is true |
| Q7 | The search page calls `moveTo` on a shared map handle, then goes to /map; the map starts there | It goes to `/map?lat=…&lng=…`; the map page reads the URL into the map's starting centre | Same as JR | Same as JR | Same as JR (the URL sets the map's `center` state) |
| Q8 | The map's trigger part moves the map to the person's location | Calls `locate()` on the map object | The map's trigger part (given the object) moves to the person's location | Calls `locate()` on the map element | Reads the person's position once and writes it into the map's `center` state; shows a message if access is refused |
