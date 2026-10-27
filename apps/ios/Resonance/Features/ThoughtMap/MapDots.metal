#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

// The thought map's dot grid (the web's mapDots.ts, MapDots in ThoughtMapWorld.swift): a dot at
// the centre of every `spacing`-point tile positioned at the camera, `radius` points across its
// solid part with an antialiased `edge` beyond. A tile in every 4th row and column is the sparse
// lattice, always drawn; one in every 2nd shows at `mid`, any other at `fine` — so the paper
// thins out instead of crowding as the board zooms out. `dot` is the ink, opaque (SwiftUI hands
// colours over premultiplied); `strength` how much of it the paper takes.
[[ stitchable ]] half4 mapDots(float2 position, half4 color, float spacing, float2 origin, half4 dot,
                               float fine, float mid, float radius, float edge, float strength) {
    float2 local = position - origin;
    float2 tile = floor(local / spacing);
    float2 cell = local - spacing * tile;
    float d = distance(cell, float2(spacing * 0.5));
    float2 by4 = tile - 4.0 * floor(tile * 0.25);
    float2 by2 = tile - 2.0 * floor(tile * 0.5);
    float level = (by4.x == 0.0 && by4.y == 0.0) ? 1.0 : (by2.x == 0.0 && by2.y == 0.0) ? mid : fine;
    float a = (1.0 - smoothstep(radius, radius + edge, d)) * level * strength;
    return mix(color, dot, half(a));
}
