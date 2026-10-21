# Pokémon sample card artwork

Nine card images retrieved on 2026-10-21 from [TCGdex](https://tcgdex.dev/assets).
Exact card metadata URLs, image URLs, illustrators, source IDs and SHA-256 hashes
are recorded in `sources.json` alongside these files.

Cards: Charizard (base1-4), Blastoise (base1-2), Venusaur (base1-15), Mewtwo
(base1-10), Pikachu (base1-58), Bulbasaur (base1-44), Charmander (base1-46),
Squirtle (base1-63), Eevee (base2-51, Jungle).

The high WebP downloads are unchanged. `*-poster.webp` files are proportional
thumbnails fitting 360×495, re-encoded at WebP quality 86. No artwork was redrawn.
The viewer reuses the supplied card geometry and back, replacing only the front
color/emissive texture at runtime and flipping the pixels to match the GLB UVs.

Pokémon card artwork and trademarks belong to their respective owners, including
The Pokémon Company, Nintendo, Creatures, GAME FREAK and the credited illustrators.
Availability through TCGdex does not grant a Creative Commons license to this
artwork. These images are demonstration samples, separate from this site's game
content and from the model's CC BY 4.0 attribution. No endorsement is implied.

For geometry/back attribution see `../../models/ATTRIBUTION.md`.
