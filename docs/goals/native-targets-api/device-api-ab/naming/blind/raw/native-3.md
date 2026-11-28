1. `native`: Swift and Kotlin developers call the platform's own components "native", meaning the real sheet, tab bar or camera view as opposed to one you draw yourself, so `native.sheet` reads straight away as "the real system sheet".
2. `system`: Both platforms already use this word for platform-provided UI (system sheet, system menu, system camera, SystemBarStyle), so it clearly says the OS draws the frame, not my markup.
3. `os`: It's short and says plainly that the operating system supplies the component, though it reads a little oddly for the website build, where the browser supplies it.

Tools used: none, other than the one Read of the prompt file that I was told to make.
