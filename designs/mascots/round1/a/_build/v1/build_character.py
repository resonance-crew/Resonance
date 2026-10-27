import os
import sys
from tingya import *

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def character_svg():
    d = Drawer(MAIN, 'a-', seed=7)
    body = d.draw()
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<!-- 聽芽 Tingya — direction A, colored pencil. Every part is its own <g id="a-…">; pivots in comments.
     Colours are custom properties (--a-ink, --a-fur, …) with day defaults; a night paper overrides them. -->
<defs>
{style_block()}
{filters()}
</defs>
<g id="a-tingya">
{body}
</g>
</svg>
"""


if __name__ == '__main__':
    open(os.path.join(OUT, 'character.svg'), 'w').write(character_svg())
    print('ok', os.path.getsize(os.path.join(OUT, 'character.svg')))
