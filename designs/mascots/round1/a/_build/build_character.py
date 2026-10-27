import os
import sys
from tingya import *

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def character_svg():
    d = Drawer(MAIN, 'a-', seed=7)
    body = d.draw()
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<!-- 聽芽 Tingya, direction A, colored pencil (v2). Every part is its own g element with an a- id; pivots in comments.
     The sprout is two nested pieces: a-antenna-stem holds a-antenna-curl.
     Colours are CSS custom properties named a-ink, a-fur, a-under and so on (each with a day default);
     a night paper overrides them on the element that holds the drawing. -->
<defs>
{style_block()}
{filters()}
</defs>
<g id="a-tingya" transform="translate(36 -62)"><!-- the drawing's own coordinates: every pivot below is given inside this translate -->
{body}
</g>
</svg>
"""


if __name__ == '__main__':
    open(os.path.join(OUT, 'character.svg'), 'w').write(character_svg())
    print('ok', os.path.getsize(os.path.join(OUT, 'character.svg')))
