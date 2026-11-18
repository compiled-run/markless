Ranking: 1, 6, 2, 9, 4, 3, 7, 5, 8
B: Version 1 is clearest because "headless" is the word I've seen for components that handle behaviour but come with no styles. Version 8 is least clear because `@markless/base` clashes with the `base` import inside it and tells me nothing about what it holds or whether it's styled. None of the nine names says whether the pieces work in the phone apps, so I'm only guessing they do because nothing is imported from `native`.
C: I'd try `@markless/ui` first, because it's the name I'd expect a framework's main component package to have, and the code reads fine with it.
Tools used: none
